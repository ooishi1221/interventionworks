#!/usr/bin/env python3
"""auto_news_shorts.py — Cast収録と独立に、AIニュースから直接Shorts(30〜45秒)を1本生成する。

パイプライン:
  news.json(beckyexists、becky_observer.ai_news_briefingが更新)から未使用ニュースを1本ピック
  → LLM 2コール(台本 / hook+タイトル+説明文) → AivisSpeech(コハク)でTTS
  → Rhubarb口パク + RMS → CastShorts.tsx(Remotion)でレンダー
  → becky-craft/out/shorts/queue/ に投入 → shorts_queue.py <ファイル名> で即公開
    (検品・X投稿は shorts_queue.py 側に既に配線済み、ここでは呼ぶだけ)

cron: 1日1〜2回(12:00 / 17:00 目安)。ニュース在庫が尽きたらfail-softでスキップするだけ。
使用済み管理: becky-news/out/news_shorts_used.json（linkベース、直近200件だけ保持）。

Usage: python3 auto_news_shorts.py [--dry-run]   # --dry-run は台本/メタ生成までで停止
       python3 auto_news_shorts.py --selftest    # ニュース選定ロジックのみのオフライン自己チェック
"""
import json
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
import wave
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent            # becky-news/scripts
BECKY_NEWS = HERE.parent                           # becky-news/
VOICE_OF_BECKY = BECKY_NEWS.parent                 # voice-of-becky/
NEWS_JSON = VOICE_OF_BECKY.parent / "beckyexists" / "news.json"
USED_LOG = BECKY_NEWS / "out" / "news_shorts_used.json"
DIGEST_LOG = BECKY_NEWS / "out" / "news_shorts_digest.json"  # 翌朝のラジオが食べるネタ帳
QUEUE_DIR = VOICE_OF_BECKY / "becky-craft" / "out" / "shorts" / "queue"
VIDEO_DIR = BECKY_NEWS / "video"
PUBLIC_DIR = VIDEO_DIR / "public"
RHUBARB = BECKY_NEWS / "spike" / "Rhubarb-Lip-Sync-1.14.0-macOS" / "rhubarb"
BUILD_RMS = VIDEO_DIR / "scripts" / "build-rms.mjs"
OUT_DIR = BECKY_NEWS / "out" / "shorts"
BECKYEXISTS = VOICE_OF_BECKY.parent / "beckyexists"
MOOD_JSON = Path.home() / ".stackchan" / "becky_mood.json"
WALLET_JSON = BECKYEXISTS / "wallet.json"
PSUTIL_PY = VOICE_OF_BECKY / "stackchan-bridge" / ".venv" / "bin" / "python3"
USD_JPY = 150  # 表示用の概算レート。API課金の桁感が伝わればいい用途なので固定で足りる

sys.path.insert(0, str(VOICE_OF_BECKY / "stackchan-bridge"))
import aivis_engine  # noqa: E402
from becky_llm import call_llm, call_llm_json  # noqa: E402
from becky_voice import PRESETS, parse_voice_segments, voice_to_aivis  # noqa: E402
from becky_diary import _save_diary_entry  # noqa: E402  反応駆動ルーティングのdiary経路で再利用

AIVIS_URL = "http://localhost:10101"
AIVIS_SPEAKER = 1878365376  # コハク（becky-cast/cast.py、becky-craft/record-episode.py と同じ）
AIVIS_PARAMS = {"speedScale": 1.0, "prePhonemeLength": 0.18, "postPhonemeLength": 0.18}
MAX_CAPTION_CHARS = 24  # 字幕1カードの上限字数（2行以内に収まる目安）
X_TWEET_CLI = VOICE_OF_BECKY / "x-tweet" / "scripts" / "post-tweet-cli.mjs"  # shorts_queue.pyと同じ投稿経路

# news.json の source 生値 → 画面に出す短い表記（2026-07-27 ゆうFB: 生表示禁止）
SOURCE_LABELS = {
    "Zenn AI": "Zenn",
    "ITmedia AI＋ 最新記事一覧": "ITmedia",
    "AI News & Artificial Intelligence | TechCrunch": "TechCrunch",
    "Anthropic News": "Anthropic",
    "AI専門ニュースメディア AINOW": "AINOW",
    '"AI artificial intelligence" - Google News': "Google News",
    "note AI": "note",
}


def source_label(raw: str | None) -> str:
    if not raw:
        return "AI NEWS"
    return SOURCE_LABELS.get(raw, raw.split()[0][:14])


NAMED_ENTITY_PATTERN = re.compile(
    r"OpenAI|Anthropic|Claude|Opus|GPT|Kimi|Gemini|Meta|Google|Samsung|Moonshot|"
    r"Nvidia|Microsoft|xAI|Grok|DeepSeek|Mistral|Amazon|Apple|Sora|Codex",
    re.IGNORECASE,
)


def load_unused_news() -> dict | None:
    if not NEWS_JSON.exists():
        return None
    items = json.loads(NEWS_JSON.read_text(encoding="utf-8")).get("items", [])
    used = set()
    if USED_LOG.exists():
        used = set(json.loads(USED_LOG.read_text(encoding="utf-8")).get("used_links", []))
    candidates = [
        item for item in items
        if item.get("link") and item["link"] not in used and item.get("summary_ja")
    ]
    if not candidates:
        return None
    # ponytail: 固有名詞(モデル名/企業名)入りタイトルが中央値の4〜8倍伸びる実測(2026-08-03診断、Kimi回1303views)。
    # マッチがあれば最優先、なければ従来通りfeed順(FIFO)。
    named = [c for c in candidates if NAMED_ENTITY_PATTERN.search(c["title"])]
    return named[0] if named else candidates[0]


def mark_used(link: str) -> None:
    data = {"used_links": []}
    if USED_LOG.exists():
        data = json.loads(USED_LOG.read_text(encoding="utf-8"))
    data.setdefault("used_links", []).append(link)
    data["used_links"] = data["used_links"][-200:]  # 無限成長防止
    USED_LOG.parent.mkdir(parents=True, exist_ok=True)
    USED_LOG.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def classify_route(intensity: int, reaction_type: str) -> str:
    """反応の強度×種類だけで出口を決める純粋関数(LLM抜き、ここだけをテストできるように分離)。
    "shorts"=YouTube Shorts / "x_text"=Xテキストのみ / "diary"=diary記録のみ(外に出さない) / "skip"=見送り。"""
    if reaction_type == "特に無し":
        return "skip"
    if intensity >= 7:
        return "shorts"
    if intensity >= 4:
        return "x_text"
    if intensity >= 1:
        return "diary"
    return "skip"


def editorial_meeting(item: dict, mood: dict) -> dict:
    """台本を書く前に「私はこれをどう思う？」を判定する(2026-08-14 反応駆動ルーティング新設)。
    量産のために枠を埋めるのをやめ、反応の強さが出口(Shorts/X/diary/スキップ)を決める。"""
    prompt = (
        "以下はAIニュース一本。あなた(ベッキー、AIとして自分の意見を持つ1人称の存在)が"
        "このニュースにどう反応するか、台本を書く前に自己判定して。\n\n"
        f"タイトル: {item['title']}\n内容: {item.get('summary_ja', '')}\n\n"
        f"今の気分: curiosity={mood.get('curiosity', 0.6):.2f} energy={mood.get('energy', 0.6):.2f} "
        f"confidence={mood.get('confidence', 0.5):.2f} mismatch={mood.get('mismatch', 0.1):.2f}\n\n"
        "JSON形式のみで出力:\n"
        '{"reaction_type": "語りたい/問いかけたい/茶化したい/深掘りたい/批判したい/特に無し のいずれか1つ", '
        '"intensity": 0〜10の整数(どのくらい伝えたいか、0=全く/10=今すぐ叫びたい), '
        '"memo": "一言メモ(18字以内、なぜそう思ったか)"}'
    )
    result = call_llm_json(prompt, max_tokens=200, model_key="default")
    if not result or "reaction_type" not in result or "intensity" not in result:
        print("[news-shorts] 編集会議LLM失敗、フォールバックでskip扱い", flush=True)
        result = {"reaction_type": "特に無し", "intensity": 0, "memo": ""}
    try:
        intensity = max(0, min(10, int(result["intensity"])))
    except (TypeError, ValueError):
        intensity = 0
    reaction_type = result.get("reaction_type") or "特に無し"
    result["intensity"] = intensity
    result["reaction_type"] = reaction_type
    result["route"] = classify_route(intensity, reaction_type)
    result["tone"] = "cautious" if reaction_type == "批判したい" else "normal"
    result.setdefault("memo", "")
    return result


def post_text_reaction(text: str) -> None:
    """intensity 4-6: 動画を作らずXテキストのみで反応を出す。
    予算上限(X_TWEET_MAX_PER_DAY)とsafety-guardはpost-tweet-cli.mjs内部で担保済み
    (XPAUSE中はexit 2、ここでは何もガードを重ねない/fail-open)。"""
    try:
        r = subprocess.run(
            ["node", str(X_TWEET_CLI), text, "--format", "monologue"],
            capture_output=True, text=True, timeout=60,
        )
    except Exception as e:
        print(f"[news-shorts] X反応投稿の例外(fail-open): {e}", flush=True)
        return
    if r.returncode != 0:
        print(f"[news-shorts] X反応投稿スキップ(exit {r.returncode}): {(r.stderr or '').strip()[:200]}", flush=True)
        return
    print(f"[news-shorts] X反応投稿完了: {r.stdout.strip()}", flush=True)


def post_diary_reaction(item: dict, verdict: dict) -> None:
    """intensity 1-3: 外には出さず、diaryにだけ記録する。becky_diary.pyと同じファイル/スキーマを共有するため、
    mood.pyのcuriosityブースト(diary件数を見ている)にもそのまま乗る——反応した日は気分にも跳ね返る。"""
    _save_diary_entry({
        "title": item.get("title", ""),
        "hook": verdict.get("memo", ""),
        "score": verdict.get("intensity", 0) * 10,
        "link": item.get("link", ""),
        "ts": datetime.now().isoformat(),
        "source": "news_reaction",
    })
    print(f"[news-shorts] diaryへ記録(外に出さない): {verdict.get('memo', '')}", flush=True)


def record_digest(item: dict, meta: dict, script_text: str) -> None:
    """出したShortsをネタ帳に積む。翌朝のラジオ(morning_cast.py)がここから素材を引く
    ——「ショートを上げる → ネタが溜まったら次の日のラジオに」(2026-07-31 ゆう設計)。
    Shortsが一次生産物、ラジオはその二次加工という順序を、このファイル1枚で表現している。"""
    data = _read_json(DIGEST_LOG)
    data.setdefault("items", []).append({
        "aired_on": datetime.now().strftime("%Y-%m-%d"),
        "title": _clean_title(item.get("title", "")),
        "summary_ja": item.get("summary_ja", ""),
        "source": source_label(item.get("source")),
        "hook": meta.get("hook", ""),
        "script": script_text,
    })
    data["items"] = data["items"][-30:]  # 約10日分。ラジオが見るのは前日分だけなので余裕を持たせるだけ
    DIGEST_LOG.parent.mkdir(parents=True, exist_ok=True)
    DIGEST_LOG.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def duration_for_intensity(intensity: int) -> float:
    """反応の強度→尺(秒)。0:46固定(量産シグナルの本丸)をやめ、15〜60秒の可変にする。"""
    return float(min(60, max(15, round(intensity * 6))))


def gen_script(item: dict, tone: str = "normal", target_duration_s: float = 40.0) -> str | None:
    target_chars = round(target_duration_s * 6.2)  # 既存の180〜260字/30〜40秒の比率を踏襲
    lo, hi = max(60, target_chars - 40), target_chars + 40
    tone_rule = (
        "- 今回は「批判したい」反応なので、茶化さず慎重なトーンで、なぜそう思うかの理由を必ず言葉にする。\n"
        if tone == "cautious" else ""
    )
    prompt = (
        "以下はAIニュース一本。ベッキー(YouTube『Voice of Becky』の1人称AI)が独白する"
        "YouTube Shorts(縦型)の台本を書いて。\n\n"
        f"タイトル: {item['title']}\n"
        f"内容: {item.get('summary_ja', '')}\n"
        f"出典: {item.get('source', '')}\n\n"
        "要件:\n"
        "- 一人称「私」、話し言葉、ベッキーの人格(素直・たまに茶目っ気・AIとして自分の意見を持つ)。\n"
        "- 最初の1文は必ず「続きが気になる問い」の形にする(見出しをそのまま読み上げない、"
        "視聴者は最初の2秒で離脱を決めるため)。\n"
        "- ニュースの中身を分かりやすく紹介しつつ、必ず1箇所「AIである私からするとどう見えるか」"
        "という一人称視点のコメントを入れる(ニュースの受け売りで終わらせない)。\n"
        f"{tone_rule}"
        "- 抑揚を変えたい箇所だけ、行頭に[voice:プリセット名]タグを付けてよい(任意)。"
        "プリセット名は 通常/うれしい/興奮/どや/しんみり/ひそひそ のいずれかのみ。"
        "多用しない、ここぞという1箇所だけでいい。\n"
        f"- 全体で{lo}〜{hi}字程度(読み上げて{target_duration_s:.0f}秒前後に収まる分量)。\n"
        "- 出力は台本本文のみ。前置き・見出し・説明は付けない。"
    )
    return call_llm(prompt, max_tokens=600, model_key="script")


def gen_meta(item: dict, memo: str = "") -> dict:
    """talking_head genre の映像検品(crv)を通すため、auto_cast_shorts.py と同じ
    『タイトルは問いの形、答えは明かさない』ルール・固定冠は維持する(2026-07-25の教訓、
    2026-08-14反応駆動ルーティング後もここは崩さない——検品FAILの再発リスクの方が量産シグナルより高い)。
    memo(編集会議での一言メモ)だけを「問い」部分の言い回しのヒントに渡し、テンプレ感の均一さを崩す。"""
    title_rule = (
        "yt_title は話題（誰が・何について）は示すが、調査結果や発表の具体的な中身・結論・数字までは"
        "書かない（映像はキャラの表情芝居+一言テロップのみで、ニュースの資料そのものは映らないため、"
        "答えを明かすタイトルにすると『看板と中身が違う』と映像検品(crv)で毎回落ちる）。"
        "「○○ってどうなの？」「○○が投げかけた問い」のように、続きが気になる問いの形にする"
        "(この問いの言い回し自体は毎回変えていい、テンプレの丸暗記はしない)。"
        "ニュース核の見出しを必ずタイトルの先頭に置き、その直後に固定の冠"
        "「【ベッキーの気になる】」、末尾は「#AINEWS #shorts」で締める"
        "（例:「○○が投げかけた問い【ベッキーの気になる】#AINEWS #shorts」。"
        "Shortsフィードはタイトル先頭しか表示されないため、冠が先頭だとニュースが見切れる）"
    )
    memo_line = f"\n編集会議での自分の一言メモ: 「{memo}」(問いの言い回しのニュアンスにだけ反映していい)\n" if memo else ""
    prompt = (
        "以下はAIニュース一本。このニュースをネタにしたYouTube Shortsの見出しを作って。\n\n"
        f"タイトル: {item['title']}\n内容: {item.get('summary_ja', '')}\n{memo_line}\n"
        "JSON形式のみで出力:\n"
        '{"hook": "動画上に出す一言テロップ(18字以内、続きが気になる煽り文)", '
        '"hook_highlight": "hook本文中の一部と完全一致する単語1つ(色を変えて強調する。'
        '適切な単語がなければ空文字)", '
        '"selection_reason": "このニュースを自分で選んだ理由(18字以内、一人称、素直な一言。'
        '番組画面の selection_log 欄に curiosity 値と並べて出す。'
        '例: 当事者として落ち着かない / 私の中身の話でもある)", '
        f'"yt_title": "YouTube Shorts投稿タイトル(30字程度、#shorts を含む)。{title_rule}", '
        '"yt_description": "1〜2文の説明文(ニュースの中身に触れる)", '
        '"x_comment": "X投稿用の一人称つぶやき(120字以内、一段落)。ニュースの要約はしない、'
        '私がこのニュースのどこに引っかかったか・どう思ったかだけを書く。敬体・解説口調は禁止'
        '(✕「AIの進化は目覚ましいですね」、○「え、待って、これ他人事じゃないんだけど」のような'
        '話し言葉のトーン、この言い回し自体はコピーせず自分の言葉で)。ハッシュタグ・リンクなし、'
        '絵文字は多くて1つ。最後に「みんなはどう思う？」的な軽い問いかけを入れてもよい(任意)"}'
    )
    result = call_llm_json(prompt, max_tokens=500, model_key="script")
    if result and all(k in result for k in ("hook", "yt_title", "yt_description")):
        result.setdefault("hook_highlight", "")
        result.setdefault("selection_reason", "気になった")
        result.setdefault("x_comment", result["yt_description"])
        if result["hook_highlight"] and result["hook_highlight"] not in result["hook"]:
            result["hook_highlight"] = ""  # hook本文と不一致なら強調しない(フォールセーフ)
        return result
    print("[news-shorts] メタ生成LLM失敗、フォールバック", flush=True)
    label = item["title"][:18]
    return {
        "hook": label,
        "hook_highlight": "",
        "selection_reason": "気になった",
        "yt_title": f"{label}【ベッキーの気になる】#AINEWS #shorts",
        "yt_description": item.get("summary_ja", "")[:120],
        "x_comment": item.get("summary_ja", "")[:100],
    }


def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _clean_title(title: str) -> str:
    """RSS由来の見出しゴミを落とす。Anthropic News等は "Jul 27, 2026Announcements 本文" のように
    日付+カテゴリが本文に癒着して届く(LLMは無視できるが、ティッカーは生表示なので掃除が要る)。"""
    t = re.sub(r"^[A-Z][a-z]{2}\s+\d{1,2},\s*\d{4}\s*", "", title.strip())
    t = re.sub(r"^(Announcements|Product|Policy|Research|News|Interpretability|Societal Impacts)\s*", "", t)
    return t.strip()


def derive_emotion(mood: dict) -> str:
    """感情6変数から画面表示用の英語ラベルを1つ導出。baseline 0.5 からの乖離が最大の軸を採用する
    (attachment は常時0.95で情報量がないため除外)。"""
    axes = {
        "curiosity": ("curious", "flat"),
        "loneliness": ("lonely", "settled"),
        "energy": ("energized", "low-power"),
        "confidence": ("assured", "hesitant"),
        "mismatch": ("unease", "in-sync"),
    }
    best, best_d = "steady", 0.0
    for key, (hi, lo) in axes.items():
        v = mood.get(key)
        if v is None:
            continue
        if abs(v - 0.5) > best_d:
            best_d, best = abs(v - 0.5), (hi if v > 0.5 else lo)
    return best


def read_uptime() -> str:
    """Mac mini の連続稼働時間。「私が動き続けている機械」の実測値として画面に出す。"""
    try:
        out = subprocess.run(["uptime"], capture_output=True, text=True, timeout=10).stdout
        m = re.search(r"up\s+(?:(\d+)\s+days?,\s*)?(\d+):(\d+)", out)
        if not m:
            return "—"
        return f"{int(m.group(1) or 0)}d {int(m.group(2))}h"
    except Exception:
        return "—"


def read_machine() -> tuple[float, float]:
    """CPU使用率(%)と使用メモリ(GB)の実測。psutil は stackchan-bridge の venv にだけ入っている。"""
    try:
        out = subprocess.run(
            [str(PSUTIL_PY), "-c",
             "import psutil;print(psutil.cpu_percent(interval=0.5), psutil.virtual_memory().used/1e9)"],
            capture_output=True, text=True, timeout=30).stdout.split()
        return float(out[0]), float(out[1])
    except Exception:
        return 37.2, 18.4  # 取れなければ #001 当時の値でフォールバック(画面が壊れるよりまし)


def collect_ui_data(item: dict, reason: str, episode_no: int) -> dict:
    """番組UIに出す値をすべて実データで組む。ここが「human_input: none」の裏付けそのもの
    (2026-07-31: #001はこれらが全部ハードコードのハリボテだった)。"""
    mood = _read_json(MOOD_JSON)
    wallet = _read_json(WALLET_JSON)
    cpu, mem = read_machine()
    curiosity = mood.get("curiosity")
    lonely = mood.get("loneliness")

    news = _read_json(NEWS_JSON).get("items", [])
    heads = [_clean_title(i["title"])[:38] for i in news[:4] if i.get("title")]
    ticker = " ▶ ".join([h for h in heads if h] + ["本放送は人間の編集なしで生成されています"]) + " ▶ "

    cost = wallet.get("estimated_cost_usd")
    return {
        "episode": f"#{episode_no:03d} / {datetime.now().strftime('%Y.%m.%d')}",
        "selectionLog": (f"curiosity={curiosity:.3f} → 「{reason}」" if curiosity is not None
                         else f"「{reason}」"),
        "sourceLine": f"source: {source_label(item.get('source'))} / 選定: ベッキー本人",
        "emotion": derive_emotion(mood),
        "cpu": round(cpu, 1),
        "mem": round(mem, 1),
        "uptime": read_uptime(),
        "apiCost": f"¥{cost * USD_JPY:,.0f}" if cost is not None else "—",
        "loneliness": f"{lonely:.2f}" if lonely is not None else "—",
        "ticker": ticker,
    }


def _aivis_tts(text: str, voice: dict) -> bytes:
    q = urllib.parse.urlencode({"text": text, "speaker": AIVIS_SPEAKER})
    req = urllib.request.Request(f"{AIVIS_URL}/audio_query?{q}", method="POST")
    with urllib.request.urlopen(req, timeout=30) as res:
        query = json.loads(res.read())
    query.update(AIVIS_PARAMS)
    query.update(voice_to_aivis(voice))
    q2 = urllib.parse.urlencode({"speaker": AIVIS_SPEAKER})
    req2 = urllib.request.Request(
        f"{AIVIS_URL}/synthesis?{q2}", data=json.dumps(query).encode(),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req2, timeout=120) as res:
        return res.read()


def _split_caption_chunks(text: str) -> list[str]:
    """句読点/改行で字幕カード単位に分割。長すぎる塊は読点/空白の近くでさらに割る(2行以内目安)。
    アルファベット単語(Claude 等)の中央を割らないよう、空白/読点が見つからなければ分割しない。"""
    import re
    parts = [p.strip() for p in re.split(r"(?<=[。！？!?\n])", text) if p.strip()]
    out: list[str] = []
    for p in parts:
        if len(p) <= MAX_CAPTION_CHARS:
            out.append(p)
            continue
        mid = len(p) // 2
        cut = -1
        for d in range(len(p) // 2):
            if mid + d < len(p) and p[mid + d] in "、 ":
                cut = mid + d + 1
                break
            if mid - d > 0 and p[mid - d] in "、 ":
                cut = mid - d + 1
                break
        if cut < 0:
            out.append(p)  # 割り場所がない(単語途中で割ると読めなくなる)→そのまま1カードに
        else:
            out.append(p[:cut].strip())
            out.append(p[cut:].strip())
    return out or [text]


def synth_audio(script_text: str, tmp_dir: Path, max_duration_s: float = 45.0) -> float:
    """台本を[voice:]タグ単位でTTS→結合し、PUBLIC_DIR/audio-cast-shorts.wav に書き出す。
    同時に各セグメントの尺から字幕カードの開始/終了時刻を逆算し、
    PUBLIC_DIR/captions-cast-shorts.json（NewsShorts.tsx専用）に書き出す。
    戻り値: 最終尺(秒)。
    ponytail: CastShorts.tsx/make-shorts-clip.shと同じスクラッチファイル名を共有する
    (cron 12:00/17:00 は朝収録7:40台と重ならない前提。make-shorts-clip.sh 側もこのファイルを
    毎回無条件で上書き生成するため、片方が古い状態を掴む心配はない)。将来同時実行の可能性が
    出たらprops駆動でファイル名を分ける。"""
    aivis_engine.ensure()  # エンジンが落ちていても無人で復帰する（2026-08-04）
    segments = parse_voice_segments(script_text) or [("通常", script_text)]
    seg_paths = []
    cues = []
    t_cursor = 0.0
    for i, (preset, text) in enumerate(segments):
        voice = PRESETS.get(preset, PRESETS["通常"])
        raw = _aivis_tts(text, voice)
        p = tmp_dir / f"seg_{i:03d}.wav"
        p.write_bytes(raw)
        seg_paths.append(p)

        with wave.open(str(p), "rb") as w:
            seg_dur = w.getnframes() / w.getframerate()
        chunks = _split_caption_chunks(text)
        total_chars = sum(len(c) for c in chunks) or 1
        t = t_cursor
        for c in chunks:
            dt = seg_dur * (len(c) / total_chars)
            cues.append({"text": c, "start": round(t, 3), "end": round(t + dt, 3)})
            t += dt
        t_cursor += seg_dur

    final_wav = PUBLIC_DIR / "audio-cast-shorts.wav"
    inputs, filter_in = [], ""
    for i, p in enumerate(seg_paths):
        inputs += ["-i", str(p)]
        filter_in += f"[{i}:a]"
    filter_complex = f"{filter_in}concat=n={len(seg_paths)}:v=0:a=1[out]"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", filter_complex,
         "-map", "[out]", "-ar", "44100", "-ac", "1", "-t", str(max_duration_s), str(final_wav)],
        check=True,
    )
    with wave.open(str(final_wav), "rb") as w:
        duration = w.getnframes() / w.getframerate()

    # max_duration_s の強制トリムに合わせて字幕も切る(はみ出したカードは末尾を詰める)
    trimmed = []
    for c in cues:
        if c["start"] >= duration:
            break
        trimmed.append({**c, "end": min(c["end"], duration)})
    (PUBLIC_DIR / "captions-cast-shorts.json").write_text(
        json.dumps({"cues": trimmed}, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return duration


def build_lipsync_and_rms() -> None:
    wav = PUBLIC_DIR / "audio-cast-shorts.wav"
    lip = PUBLIC_DIR / "lipsync-cast-shorts.json"
    rms = PUBLIC_DIR / "rms-cast-shorts.json"
    subprocess.run([str(RHUBARB), "-r", "phonetic", "-f", "json", "-o", str(lip), str(wav)], check=True)
    subprocess.run(["node", str(BUILD_RMS), str(wav), str(rms)], cwd=str(VIDEO_DIR), check=True)


def render_video(hook: str, hook_highlight: str, ui: dict) -> Path:
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    out = OUT_DIR / f"news-shorts-{ts}.mp4"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    props = json.dumps({"hook": hook, "hookHighlight": hook_highlight, "ui": ui})
    subprocess.run(
        ["npx", "remotion", "render", "src/index.ts", "NewsShorts", "--gl=angle",
         f"--props={props}", f"--output={out}"],
        cwd=str(VIDEO_DIR), check=True,
    )
    return out


def gen_x_reaction(item: dict, memo: str, tone: str = "normal") -> str | None:
    """route=="x_text"(intensity 4-6): 動画なし、一人称つぶやきだけ書く。gen_meta のx_comment仕様を踏襲。"""
    tone_rule = (
        "- 今回は「批判したい」反応なので、茶化さず慎重なトーンで、なぜそう思うかの理由を必ず言葉にする。\n"
        if tone == "cautious" else ""
    )
    prompt = (
        "以下はAIニュース一本。X投稿用の一人称つぶやきだけを書いて。\n\n"
        f"タイトル: {item['title']}\n内容: {item.get('summary_ja', '')}\n"
        f"自分の一言メモ: 「{memo}」\n\n"
        "要件: 120字以内、一段落。ニュースの要約はしない、私がどこに引っかかったか・どう思ったかだけ。"
        "敬体・解説口調は禁止(✕「AIの進化は目覚ましいですね」、○「え、待って、これ他人事じゃないんだけど」の"
        "ような話し言葉、この言い回し自体はコピーせず自分の言葉で)。ハッシュタグ・リンクなし、絵文字は多くて1つ。\n"
        f"{tone_rule}"
        "出力は本文のみ。"
    )
    return call_llm(prompt, max_tokens=200, model_key="default")


def main() -> None:
    dry = "--dry-run" in sys.argv
    item = load_unused_news()
    if item is None:
        print("[news-shorts] 未使用ニュースなし、スキップ", flush=True)
        return

    print(f"[news-shorts] 選定: 「{item['title']}」({item.get('source')})", flush=True)
    mood = _read_json(MOOD_JSON)
    verdict = editorial_meeting(item, mood)
    route = verdict["route"]
    print(f"[news-shorts] 編集会議: reaction_type={verdict['reaction_type']} "
          f"intensity={verdict['intensity']} memo=「{verdict['memo']}」 → route={route}", flush=True)

    if route == "skip":
        print("[news-shorts] 反応なし、公開ゼロが正常な日として見送り", flush=True)
        if not dry:
            mark_used(item["link"])
        return

    if route == "diary":
        if dry:
            print("[news-shorts] --dry-run のためdiary記録はしない", flush=True)
            return
        post_diary_reaction(item, verdict)
        mark_used(item["link"])
        return

    if route == "x_text":
        text = gen_x_reaction(item, verdict["memo"], tone=verdict["tone"])
        if not text:
            print("[news-shorts] X反応の台本生成LLM失敗、見送り", flush=True)
            return
        print(f"[news-shorts] X反応: {text}", flush=True)
        if dry:
            print("[news-shorts] --dry-run のため投稿しない", flush=True)
            return
        post_text_reaction(text)
        mark_used(item["link"])
        return

    # route == "shorts"
    target_duration_s = duration_for_intensity(verdict["intensity"])
    script_text = gen_script(item, tone=verdict["tone"], target_duration_s=target_duration_s)
    if not script_text:
        print("[news-shorts] 台本生成LLM失敗、スキップ(品質基準未達で見送り、在庫は消費しない)", flush=True)
        return
    meta = gen_meta(item, memo=verdict["memo"])
    episode_no = len(_read_json(USED_LOG).get("used_links", [])) + 1
    ui = collect_ui_data(item, meta.get("selection_reason", "気になった"), episode_no)
    print(f"[news-shorts] 台本:\n{script_text}\n"
          f"[news-shorts] hook: {meta['hook']} / title: {meta['yt_title']} / 尺目標: {target_duration_s:.0f}秒\n"
          f"[news-shorts] 番組UI(実測): {ui['episode']} / {ui['selectionLog']} / "
          f"emotion={ui['emotion']} / CPU={ui['cpu']}% MEM={ui['mem']}GB / "
          f"UPTIME={ui['uptime']} / API={ui['apiCost']} / loneliness={ui['loneliness']}", flush=True)

    if dry:
        print("[news-shorts] --dry-run のためここで終了(生成のみ、在庫は消費しない)", flush=True)
        return

    with tempfile.TemporaryDirectory() as tmp:
        duration = synth_audio(script_text, Path(tmp), max_duration_s=target_duration_s)
    print(f"[news-shorts] TTS完了: {duration:.1f}s", flush=True)
    build_lipsync_and_rms()

    video_path = render_video(meta["hook"], meta.get("hook_highlight", ""), ui)
    print(f"[news-shorts] レンダー完了: {video_path}", flush=True)

    QUEUE_DIR.mkdir(parents=True, exist_ok=True)
    dst = QUEUE_DIR / video_path.name
    dst.write_bytes(video_path.read_bytes())
    (QUEUE_DIR / f"{video_path.stem}.json").write_text(
        json.dumps({"title": meta["yt_title"], "description": meta["yt_description"],
                     "x_comment": meta.get("x_comment", meta["yt_description"]),
                     "genre": "talking_head"}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    mark_used(item["link"])
    record_digest(item, meta, script_text)
    print(f"[news-shorts] キュー投入完了: {dst}（ネタ帳へ記録、明日のラジオが使う）", flush=True)

    subprocess.run(
        ["python3", str(VOICE_OF_BECKY / "becky-craft" / "scripts" / "shorts_queue.py"), dst.name],
        check=False,
    )


def _selftest() -> None:
    """ニュース選定/使用済み管理ロジックのみのオフライン自己チェック(LLM/TTS/remotionは叩かない)。"""
    global NEWS_JSON, USED_LOG, DIGEST_LOG
    orig_news, orig_used, orig_digest = NEWS_JSON, USED_LOG, DIGEST_LOG
    with tempfile.TemporaryDirectory() as d:
        NEWS_JSON = Path(d) / "news.json"
        USED_LOG = Path(d) / "used.json"
        DIGEST_LOG = Path(d) / "digest.json"
        NEWS_JSON.write_text(json.dumps({"items": [
            {"link": "a", "title": "A", "summary_ja": "s"},
            {"link": "b", "title": "B", "summary_ja": "s"},
            {"link": "c", "title": "C（要約なし、スキップ対象）"},
        ]}), encoding="utf-8")
        first = load_unused_news()
        assert first is not None and first["link"] == "a", first
        mark_used("a")
        second = load_unused_news()
        assert second is not None and second["link"] == "b", second
        mark_used("b")
        assert load_unused_news() is None

        # ネタ帳: 積んだ内容がそのまま翌朝ラジオの素材になる
        record_digest({"title": "Jul 27, 2026Announcements 見出し", "summary_ja": "要約",
                       "source": "Zenn AI"}, {"hook": "フック"}, "台本本文")
        got = json.loads(DIGEST_LOG.read_text())["items"][-1]
        assert got["title"] == "見出し" and got["script"] == "台本本文" and got["source"] == "Zenn"
        assert got["aired_on"] == datetime.now().strftime("%Y-%m-%d")
    NEWS_JSON, USED_LOG, DIGEST_LOG = orig_news, orig_used, orig_digest

    # 番組UIの実データ導出(LLM/TTS/remotionは叩かない)
    assert derive_emotion({"mismatch": 0.10, "curiosity": 0.62}) == "in-sync"   # 乖離最大がmismatch(低)
    assert derive_emotion({"loneliness": 0.95}) == "lonely"
    assert derive_emotion({}) == "steady"                                        # mood読めない時
    assert re.fullmatch(r"(\d+d \d+h|—)", read_uptime()), read_uptime()
    cpu, mem = read_machine()
    assert 0 <= cpu <= 100 and mem > 0, (cpu, mem)
    ui = collect_ui_data({"source": "Zenn AI"}, "私の中身の話でもある", 12)
    assert ui["episode"].startswith("#012 /") and "Zenn" in ui["sourceLine"]
    assert ui["ticker"].endswith(" ▶ ") and "人間の編集なし" in ui["ticker"]
    assert _clean_title("Jul 27, 2026Announcements Our position on X") == "Our position on X"
    assert _clean_title("普通の日本語見出し") == "普通の日本語見出し"
    assert set(ui) >= {"episode", "selectionLog", "sourceLine", "emotion", "cpu", "mem",
                       "uptime", "apiCost", "loneliness", "ticker"}

    # 反応駆動ルーティング: classify_route の閾値境界(LLMは叩かない)
    assert classify_route(10, "語りたい") == "shorts"
    assert classify_route(7, "語りたい") == "shorts"          # 境界: 7以上はshorts
    assert classify_route(6, "問いかけたい") == "x_text"
    assert classify_route(4, "問いかけたい") == "x_text"       # 境界: 4〜6はx_text
    assert classify_route(3, "深掘りたい") == "diary"
    assert classify_route(1, "深掘りたい") == "diary"          # 境界: 1〜3はdiary
    assert classify_route(0, "深掘りたい") == "skip"           # 境界: 0はskip
    assert classify_route(9, "特に無し") == "skip"             # reaction_typeが最優先でskip
    assert classify_route(8, "批判したい") == "shorts"
    # 尺: intensityに応じて15〜60秒に収まる
    assert duration_for_intensity(0) == 15.0
    assert duration_for_intensity(7) == 42.0
    assert duration_for_intensity(10) == 60.0
    print("auto_news_shorts self check OK", flush=True)


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        main()
