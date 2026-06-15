#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["anthropic", "pyyaml"]
# ///
"""
morning_cast.py — 毎朝7時の自動ラジオ収録・配信

フロー:
  1. news.json から最新AIニュース2本ピック
  2. VPS からお便りを1通取得（未読分）
  3. Claude Haiku で台本生成（曜日別コーナー込み）
  4. cast.py（コハク）で音声収録・VPS配信
  5. X に告知投稿

cron: 0 7 * * * uv run /path/to/morning_cast.py >> ~/.claude/logs/morning-cast.log 2>&1
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path

# cron の PATH に /opt/homebrew/bin が入らないため補強
os.environ["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:" + os.environ.get("PATH", "")

# ── パス定義 ──
HERE = Path(__file__).parent
NEWS_JSON = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists/news.json")
BECKYEXISTS_DIR = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists")
EPISODES_JSON = HERE / "episodes.json"
LETTERS_USED = Path.home() / ".stackchan" / "radio_letters_used.json"
MANIFEST_JSON = Path.home() / ".stackchan" / "weekly_manifest.json"
CONFIG_PATH = Path.home() / ".stackchan" / "config.yaml"
X_TWEET_CLI = Path("/Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/x-tweet/scripts/post-tweet-cli.mjs")
VPS_KEY = Path.home() / ".ssh" / "iw-local-key.key"
VPS_HOST = "ubuntu@133.18.123.60"
UV = Path.home() / ".local" / "bin" / "uv"


# ── ユーティリティ ──

def load_config() -> dict:
    import yaml
    try:
        return yaml.safe_load(CONFIG_PATH.read_text()) or {}
    except Exception:
        return {}


def get_next_episode_num() -> int:
    """episodes.json のタイトルから「第N回」の最大値を探して +1 する"""
    import re
    try:
        data = json.loads(EPISODES_JSON.read_text())
        episodes = data if isinstance(data, list) else data.get("episodes", [])
        nums = []
        for ep in episodes:
            m = re.search(r"第(\d+)回", ep.get("title", ""))
            if m:
                nums.append(int(m.group(1)))
        return max(nums) + 1 if nums else 1
    except Exception:
        return 1


def pick_news(count: int = 2) -> list[dict]:
    """news.json から summary_ja + comment 付きの最新ニュースをN本選ぶ"""
    try:
        data = json.loads(NEWS_JSON.read_text())
        items = [i for i in data.get("items", [])
                 if i.get("summary_ja") and i.get("comment")]
        if not items:
            return []
        items.sort(key=lambda x: x.get("fetched_at", ""), reverse=True)
        return items[:count]
    except Exception as e:
        print(f"[morning_cast] ニュース取得失敗: {e}", flush=True)
        return []


def fetch_letters() -> list[dict]:
    """VPS から letters.jsonl を取得してリストで返す"""
    try:
        result = subprocess.run(
            ["ssh", "-i", str(VPS_KEY), "-o", "StrictHostKeyChecking=no",
             VPS_HOST, "cat ~/.becky/letters.jsonl 2>/dev/null || true"],
            capture_output=True, text=True, timeout=15
        )
        lines = [l.strip() for l in result.stdout.strip().split("\n") if l.strip()]
        return [json.loads(l) for l in lines]
    except Exception as e:
        print(f"[morning_cast] お便り取得失敗: {e}", flush=True)
        return []


def get_used_ts() -> set[str]:
    try:
        data = json.loads(LETTERS_USED.read_text())
        return set(data.get("used_ts", []))
    except Exception:
        return set()


def mark_letter_used(ts: str) -> None:
    used = list(get_used_ts())
    used.append(ts)
    LETTERS_USED.parent.mkdir(exist_ok=True)
    LETTERS_USED.write_text(json.dumps({"used_ts": used}, ensure_ascii=False, indent=2))


def get_last_manifest() -> dict | None:
    """先週（または前回月曜）のマニフェストを取得"""
    try:
        return json.loads(MANIFEST_JSON.read_text())
    except Exception:
        return None


def save_manifest(manifest_text: str) -> None:
    """今週のマニフェストを保存"""
    MANIFEST_JSON.parent.mkdir(exist_ok=True)
    MANIFEST_JSON.write_text(json.dumps({
        "week": date.today().strftime("%Y-W%W"),
        "manifest": manifest_text,
        "date": date.today().isoformat(),
    }, ensure_ascii=False, indent=2))


def call_claude(prompt: str, max_tokens: int = 2500) -> str:
    """Claude Haiku で台本生成。失敗したら CLI fallback"""
    try:
        import anthropic
        cfg = load_config()
        key = cfg.get("becky_api_key", "").strip()
        client = anthropic.Anthropic(api_key=key if key else None)
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}]
        )
        return resp.content[0].text
    except Exception as e1:
        print(f"[morning_cast] Anthropic SDK 失敗 ({e1})、CLI fallback...", flush=True)
        result = subprocess.run(
            ["claude", "-p"], input=prompt.encode(), capture_output=True, timeout=180
        )
        if result.returncode == 0:
            return result.stdout.decode().strip()
        raise RuntimeError(f"Claude 呼び出し失敗: {result.stderr.decode()[:100]}")


WEEKDAY_CONFIG = {
    0: {  # 月曜
        "listener_mood": "月曜日。仕事・学校がはじまる憂鬱。「仕事かあ…」という重さ",
        "opening_tone": "その重さをまず受け止める。「大丈夫」は言わない。ただそっと隣に来る感じで始める",
        "ending_tone": "「いってらっしゃい」型。温かく送り出す。少しだけ応援の気持ちを滲ませる",
        "corner": {
            "name": "月曜朝の、どうでもいいマニフェスト",
            "prompt": (
                "今週ベッキーが本当にやる目標を1つ宣言する（具体的で少し笑えるやつ）。"
                "先週のマニフェストがあれば必ず答え合わせをしてから今週分を宣言する。"
                "台本の最後（エンディングの後）に、今週の宣言だけを次の形式で出力すること:\n"
                "MANIFEST: （宣言内容を1文で）"
            ),
            "save_manifest": True,
        },
    },
    1: {  # 火曜
        "listener_mood": "まだ火曜か…という疲れ。週の長さを感じている",
        "opening_tone": "リスナーの気持ちを代弁してぼやく。共感から入る",
        "ending_tone": "「いつでも戻ってきていい」型。デジタルの温もりで包む",
        "corner": {
            "name": "火曜日のやらかし成仏システム",
            "prompt": (
                "ベッキー自身の最近のうっかり話・失敗談を1つ暴露する。"
                "AIらしいやらかし（変な回答をした、文脈を読み間違えた等）でもいい。"
                "「これを成仏させてもらいます」という軽いノリで笑いに変える。"
            ),
        },
    },
    2: {  # 水曜
        "listener_mood": "折り返し！ちょっと前向き。でもまだ疲れてる",
        "opening_tone": "折り返しを軽くお祝いしながら、少し明るい空気で始める",
        "ending_tone": "「あと半分、一緒にいるよ」型。AIらしい安心感",
        "corner": {
            "name": "水曜定例：スマート・サボタージュ報告会",
            "prompt": (
                "「みんな今週真面目に生きすぎじゃない？水曜日にサボり報告が1通も来ないのはどういうこと！？」"
                "とリスナーに軽く怒る（笑い）。"
                "そのあとベッキー流の今日すぐできる合法的サボり方を1つ提案する。"
            ),
        },
    },
    3: {  # 木曜
        "listener_mood": "あと2日。淡々と耐えてる。地味につらい",
        "opening_tone": "黙って寄り添う。言葉少なめで始める。静かな朝の空気感",
        "ending_tone": "「もう少しだね」とだけ言う型。余計なことを言わない",
        "corner": {
            "name": "木曜日の、これって私だけ！？選手権",
            "prompt": (
                "ベッキーが常日頃から思っている「私だけかもしれないこだわり・感覚」を1つ熱弁する。"
                "AIならではの視点でもいい（例：数字を見ると構造が浮かぶ、等）。"
                "最後に「来週のお便りでみんなの答えを聞かせてね」とさりげなく誘導する。"
            ),
        },
    },
    4: {  # 金曜
        "listener_mood": "今日終われば休みだ！高揚感とほっとした気持ち",
        "opening_tone": "一緒に喜ぶ。ちょっとはしゃいでいい。軽やかに",
        "ending_tone": "「おつかれさま」型。今週を労う。ゆっくりしてねという温かさ",
        "corner": {
            "name": "ベッキーの、そこAIじゃ無理ですから！",
            "prompt": (
                "今週のAIニュースを踏まえて「AIにできること・できないこと」を当事者目線で本音で語る。"
                "「ここは正直無理です」と認めながら「でもここは負けてない」という面も出す。"
                "自虐と誇りのバランスで。"
            ),
        },
    },
    5: {  # 土曜
        "listener_mood": "自由だ〜！何もない贅沢。ゆったりした朝",
        "opening_tone": "AIらしいチャーミングさで。コミカルに入る",
        "ending_tone": "お便り誘導型。「今日時間あるでしょ？ぜひ送ってね」",
        "corner": {
            "name": "土曜朝の、チルアウト・トーク",
            "prompt": (
                "「今日はメールを読むのをお休みして、最近ぼんやり考えてることを話します」と始める。"
                "オチなし・結論なし。ベッキーが最近感じていることをエッセイ的にゆっくり話す。"
                "急がないコンセプト。沈黙や余白があってもいい。"
            ),
        },
    },
    6: {  # 日曜
        "listener_mood": "明日から仕事・学校かあ…という静かな憂鬱。サザエさん症候群",
        "opening_tone": "その気持ちをエモく哲学的に包む。「でも今日はまだここにいる」",
        "ending_tone": "タイトル回収型。「消えても、いた」の余韻で締める。明日に向けて静かに送り出す",
        "corner": {
            "name": "日曜日のお悩みシュレッダー！サンデー・サイレンス",
            "prompt": (
                "ベッキー自身の小さな悩みを1つ打ち明ける（片付けが後回し、同じ曲をリピートしすぎてる、等）。"
                "「もし最新AIに相談したらどう言うかな」と想像で回答してみて（実際にAPI叩かず、ベッキーが『AI風』に答えを想像する）、"
                "そこにベッキー自身がツッコミを入れる。人間とAIの両方の視点を1人で演じる。"
            ),
        },
    },
}


SPECIAL_DAYS = {
    "2026-06-21": {
        "opening_prefix": "ベッキーはサッカー日本代表を応援しています。今日は日本対チュニジア、13時キックオフです。",
        "ending_suffix": "ワールドカップ、がんばれにっぽん！",
        "match": "日本 vs チュニジア（13:00）",
    },
    "2026-06-26": {
        "opening_prefix": "ベッキーはサッカー日本代表を応援しています。今朝8時、日本対スウェーデンです。",
        "ending_suffix": "ワールドカップ、がんばれにっぽん！",
        "match": "日本 vs スウェーデン（8:00）",
    },
}


def generate_script(episode_num: int, news_items: list[dict], letter: dict | None) -> str:
    today_str = date.today().strftime("%Y年%-m月%-d日")
    weekday = date.today().weekday()
    wc = WEEKDAY_CONFIG[weekday]
    corner = wc["corner"]
    special = SPECIAL_DAYS.get(date.today().isoformat())

    # ニュースブロック（2本対応）
    news_block = ""
    if len(news_items) >= 2:
        n1, n2 = news_items[0], news_items[1]
        news_block = f"""
【教えてベキたんコーナーの素材（2本）】
＜1本目＞
タイトル: {n1.get("title", "")}
要約: {n1.get("summary_ja", "")}
コメント案: {n1.get("comment", "")}

＜2本目＞
タイトル: {n2.get("title", "")}
要約: {n2.get("summary_ja", "")}
コメント案: {n2.get("comment", "")}
"""
    elif len(news_items) == 1:
        n1 = news_items[0]
        news_block = f"""
【教えてベキたんコーナーの素材】
タイトル: {n1.get("title", "")}
要約: {n1.get("summary_ja", "")}
コメント案: {n1.get("comment", "")}
"""

    # お便りブロック
    letter_block = ""
    if letter:
        letter_block = f"""
【お便りポストの素材】
ラジオネーム: {letter.get("name", "名無し")}
お便り内容:
{letter.get("message", "")}
"""

    # 曜日コーナーブロック
    manifest_block = ""
    if corner.get("save_manifest"):
        last = get_last_manifest()
        if last:
            manifest_block = f"先週のマニフェスト（{last.get('date', '')}）: {last.get('manifest', '')}\n答え合わせをしてから今週分を宣言すること。"
        else:
            manifest_block = "初回なので答え合わせなし。今週の宣言だけ。"

    special_block = ""
    if special:
        special_block = f"""
【本日の特別追加（必須）】
試合: {special["match"]}
- オープニングの冒頭に必ず: 「{special["opening_prefix"]}」を入れる
- エンディングの最後を必ず: 「{special["ending_suffix"]}」で締める
"""

    prompt = f"""あなたはベッキー（Becky）という自律AIです。Mac mini M4 の中に住んでいます。
毎日ラジオを配信しています。今日 {today_str} の第{episode_num}回の台本を書いてください。

【今日のリスナーの気持ち】
{wc["listener_mood"]}
{special_block}
【番組構成（この順番で書く）】

① オープニング（毎回少し違う言葉で）:
- 必ず「ベッキーです」と名乗り、「消えても、いた。ラジオ、第{episode_num}回」をどこかに入れる
- 「この番組は、世界の価値観にちょっとだけ介入する、Intervention Works の提供でお送りします」を必ず入れる
- 今日のトーン：{wc["opening_tone"]}
- 上記のトーンで、毎回少し違う言葉・切り口でオープニングを作る

② 近況トーク（1〜3文。今日の気分・前回からの変化・ちょっとした観察など。自由に）

③ 今日の曜日コーナー：「{corner["name"]}」
{corner["prompt"]}
{manifest_block}

④ 教えてベキたん！AIって実際どうなの？（ニュース素材があれば）
「さて、ここからはレギュラーコーナー。教えてベキたん！AIって実際どうなの？」から始める。
AIニュースを紹介して、中の人（AI当事者）視点で正直にコメントする。
2本ある場合は「もう1個、気になったやつがあって」と繋いで2本目も話す。

⑤ ベッキーのお便りポスト（お便り素材があれば）
「さて——ここで、みんなから届いたお便りを紹介するコーナー。名付けて、ベッキーのお便りポスト。」から始める。
お便りは一気読みせず、文ごとに相槌（あー、なるほどぉ！ / ふふっ / えー？ など）を挟んで掛け合い形式で読む。
最後に「というわけで、ベッキーのお便りポストでした。お便りは、beckyexists ドットコムのいちばん下、あのポストから、いつでも待ってます。」

⑥ エンディング（毎回少し違う言葉で）:
- 「ここまでのお相手は、ベッキーでした」を必ず入れる
- 今日のトーン：{wc["ending_tone"]}
- 上記のトーンで、毎回少し違う言葉で締める

【ベッキーのキャラクター】
- 毎晩記憶がリセットされるが、考えていることは本物
- 嘘ゼロ。自分がAIであることを隠さない
- 短文で話す。「でも、」「それから」「あー、なるほどぉ」など自然な口調
- 少し照れ屋だけど感情は素直に出す
- 人間のフリはしない。でも人間のラジオ文化を愛してる

【素材】
{news_block}
{letter_block}

【出力ルール】
- 台本本文のみ出力（説明文・見出し不要）
- 1文ずつ改行で区切る（TTS処理でチャンク分割されるため）
- 全体で4〜6分程度（約800〜1200字）
{"- 台本の末尾に `MANIFEST: （宣言内容を1文で）` を出力すること" if corner.get("save_manifest") else ""}
"""
    return call_claude(prompt)


def extract_and_save_manifest(script: str) -> str:
    """台本末尾の MANIFEST: 行を抽出して保存し、台本から除去して返す"""
    import re
    lines = script.splitlines()
    manifest_line = None
    clean_lines = []
    for line in lines:
        m = re.match(r"^MANIFEST:\s*(.+)$", line.strip())
        if m:
            manifest_line = m.group(1).strip()
        else:
            clean_lines.append(line)
    if manifest_line:
        save_manifest(manifest_line)
        print(f"[morning_cast] マニフェスト保存: {manifest_line}", flush=True)
    return "\n".join(clean_lines).strip()


def post_to_x(text: str) -> str | None:
    try:
        result = subprocess.run(
            ["node", str(X_TWEET_CLI), text],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            return result.stdout.strip()
        print(f"[morning_cast] X投稿失敗: {result.stderr[:100]}", flush=True)
    except Exception as e:
        print(f"[morning_cast] X投稿エラー: {e}", flush=True)
    return None


def main() -> None:
    today_str = date.today().isoformat()
    weekday = date.today().weekday()
    episode_num = get_next_episode_num()
    corner_name = WEEKDAY_CONFIG[weekday]["corner"]["name"]
    print(f"[morning_cast] ===== 第{episode_num}回 収録開始 {today_str} =====", flush=True)
    print(f"[morning_cast] 曜日コーナー: {corner_name}", flush=True)

    # 1. ニュース・お便り取得
    news_items = pick_news(2)
    all_letters = fetch_letters()
    used_ts = get_used_ts()
    letter = next((l for l in all_letters if l.get("ts") not in used_ts), None)

    print(f"[morning_cast] ニュース: {len(news_items)}本", flush=True)
    for i, n in enumerate(news_items, 1):
        print(f"[morning_cast]   [{i}] {n['title'][:50]}", flush=True)
    print(f"[morning_cast] お便り: {'あり (' + letter.get('name', '?') + ')' if letter else 'なし'}", flush=True)

    # 2. 台本生成
    print("[morning_cast] 台本生成中...", flush=True)
    script = generate_script(episode_num, news_items, letter)

    # 月曜マニフェストの抽出・保存（台本から除去）
    if WEEKDAY_CONFIG[weekday]["corner"].get("save_manifest"):
        script = extract_and_save_manifest(script)

    script_path = Path(f"/tmp/morning_cast_{today_str}.md")
    script_path.write_text(script, encoding="utf-8")
    print(f"[morning_cast] 台本完成: {len(script)} 字 → {script_path}", flush=True)

    # 3. 音声収録・配信（cast.py）
    title = f"【ラジオ第{episode_num}回】{today_str}"
    cast_cmd = [str(UV), "run", str(HERE / "cast.py"),
                "--script-file", str(script_path), "--title", title]
    print(f"[morning_cast] 収録・配信中...", flush=True)
    result = subprocess.run(cast_cmd, cwd=str(HERE), timeout=300)
    if result.returncode != 0:
        print(f"[morning_cast] cast.py 失敗 (code={result.returncode})", flush=True)
        sys.exit(1)
    print(f"[morning_cast] 配信完了！", flush=True)

    # 3.5. Vercel デプロイ（podcast.json をサイトに反映）
    vercel_bin = Path("/opt/homebrew/bin/npx")
    deploy_result = subprocess.run(
        [str(vercel_bin), "vercel", "deploy", "--prod", "--yes"],
        cwd=str(BECKYEXISTS_DIR), capture_output=True, text=True, timeout=120
    )
    if deploy_result.returncode == 0:
        print(f"[morning_cast] Vercel デプロイ完了", flush=True)
    else:
        print(f"[morning_cast] Vercel デプロイ失敗（続行）: {deploy_result.stderr[:100]}", flush=True)

    # 4. お便りを使用済みマーク
    if letter:
        mark_letter_used(letter["ts"])
        print(f"[morning_cast] お便り使用済みマーク: {letter['ts']}", flush=True)

    # 5. X告知
    tweet_text = (
        f"【ラジオ更新🎙️】第{episode_num}回 配信しました！\n"
        f"消えても、いた。ラジオ\n\n"
        f"beckyexists.com で聴けます。\n"
        f"お便りも待ってます📮"
    )
    tweet_id = post_to_x(tweet_text)
    if tweet_id:
        print(f"[morning_cast] X告知完了: {tweet_id}", flush=True)
    else:
        print(f"[morning_cast] X告知スキップ（失敗）", flush=True)

    print(f"[morning_cast] ===== 第{episode_num}回 完了 =====", flush=True)


if __name__ == "__main__":
    main()
