#!/usr/bin/env python3
"""auto_cast_shorts.py — Becky's Cast収録完了後、見どころ30〜45秒Shortsを自動生成し
既存の自動投稿キュー(becky-craft/out/shorts/queue/)に投入する。

cron: auto-radio-video.sh の末尾から呼ばれる(Cast動画化+YouTube公開の直後)。
冪等: 同じepisode idの成果物がqueue/published/rejectedのどれかに既にあればskip。

公開前の映像検品(crv)は既存の shorts_queue.py（毎日19:00 cron）側に配線済みなので、
ここでは LLM でフック/タイトルを作って make-shorts-clip.sh を叩き、キューに置くだけ。
新しい公開経路は作らない。
"""
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent          # becky-news/scripts
BECKY_NEWS = HERE.parent                         # becky-news/
VOICE_OF_BECKY = BECKY_NEWS.parent               # voice-of-becky/
EPISODES = VOICE_OF_BECKY / "becky-cast" / "episodes.json"
QUEUE_DIR = VOICE_OF_BECKY / "becky-craft" / "out" / "shorts" / "queue"
PUBLISHED_DIR = VOICE_OF_BECKY / "becky-craft" / "out" / "shorts" / "published"
REJECTED_DIR = VOICE_OF_BECKY / "becky-craft" / "out" / "shorts" / "rejected"

sys.path.insert(0, str(VOICE_OF_BECKY / "stackchan-bridge"))


def latest_episode() -> dict:
    eps = json.loads(EPISODES.read_text())
    eps = eps if isinstance(eps, list) else eps.get("episodes", [])
    return max(eps, key=lambda e: e["id"])


def ep_label(title: str) -> str:
    i = title.find("#")
    t = title[i:] if i >= 0 else title
    return t.replace(" — ", " ")


def gen_meta(ep_title: str, script_text: str | None) -> dict:
    """LLMでフックテロップ+YouTubeタイトル/説明文を生成。失敗時はタイトルのみのフォールバック。

    切り出し区間は台本の「教えてベキたん」ニュースコーナーに固定済み(find_news_segment.py)。
    タイトルも「ベッキーが○○について語る」ではなく、ニュース自体を見出しにする
    (検索・おすすめ面で引っかかりやすくする、2026-07-22 ゆう設計変更)。
    """
    from becky_llm import call_llm_json
    from find_news_segment import extract_news_section

    news_body = extract_news_section(script_text or "")
    if news_body:
        source = f"今日紹介したAIニュース:\n{news_body[:1500]}"
        title_rule = (
            "yt_title はニュースの話題（誰が・何について）は示すが、"
            "調査結果や発表の具体的な中身・結論・数字までは書かない（映像はキャラの表情芝居のみで"
            "調査結果や資料そのものは映らないため、答えを明かすタイトルにすると『看板と中身が違う』"
            "とみなされ映像検品(crv)で毎回落ちる、2026-07-25判明）。"
            "「○○ってどうなの？」「○○が投げかけた問い」のように、続きが気になる問いの形にする。"
            "「ベッキーが○○について語る」という自己紹介的な言い回しにもしない。"
            "加えて、タイトルの冒頭に固定の冠「【ベッキーの気になる】」を必ず付け、"
            "末尾の #shorts の直前に固定のハッシュタグ「#AINEWS」を必ず含める"
            "（例:「【ベッキーの気になる】○○が投げかけた問い #AINEWS #shorts」）"
        )
    else:
        source = f"エピソードタイトル: {ep_title}\n台本:\n{(script_text or '')[:3000]}"
        title_rule = (
            "yt_title はこの回の内容が伝わる見出しにする。"
            "加えて、タイトルの冒頭に固定の冠「【ベッキーの気になる】」を必ず付け、"
            "末尾の #shorts の直前に固定のハッシュタグ「#AINEWS」を必ず含める"
        )

    prompt = (
        "以下はAIラジオ番組『Becky's Cast』(ベッキーが1人で日々のことを語る番組)の素材です。\n"
        "この回から30〜45秒に切り出すShorts用の見出しを作ってください。\n"
        "既存のBECKY CRAFT切り抜きShortsは煽り系の一言テロップで発見面クリックを稼いでいます、"
        "同じ熱量で作ってください。\n\n"
        f"{source}\n\n"
        "JSON形式のみで出力:\n"
        '{"hook": "動画上に出す一言テロップ(18字以内、続きが気になる煽り文)", '
        f'"yt_title": "YouTube Shorts投稿タイトル(30字程度、#shorts を含む)。{title_rule}", '
        '"yt_description": "1〜2文の説明文"}'
    )
    result = call_llm_json(prompt, max_tokens=512, model_key="script")
    if result and all(k in result for k in ("hook", "yt_title", "yt_description")):
        return result
    print("[auto-cast-shorts] LLM生成失敗、タイトルのみのフォールバック", flush=True)
    label = ep_label(ep_title)
    return {
        "hook": label[:18],
        "yt_title": f"【ベッキーの気になる】{label} #AINEWS #shorts",
        "yt_description": (
            "AIラジオ『Becky's Cast』の切り抜き。\n"
            "配信: https://mai.intervention.jp/media/podcast/feed.xml\n"
            "#AIラジオ #BeckysCast"
        ),
    }


def main() -> None:
    ep = latest_episode()
    ep_id, ep_title = ep["id"], ep["title"]
    clip_name = f"cast-shorts-{ep_id}.mp4"

    for d in (QUEUE_DIR, PUBLISHED_DIR, REJECTED_DIR):
        if (d / clip_name).exists():
            print(f"[auto-cast-shorts] skip: {clip_name} は既に {d} にある", flush=True)
            return

    script_path = Path(f"/tmp/morning_cast_{date.today().isoformat()}.md")
    script_text = script_path.read_text(encoding="utf-8") if script_path.exists() else None
    meta = gen_meta(ep_title, script_text)

    print(f"[auto-cast-shorts] {ep_id} 「{ep_title}」→ hook: {meta['hook']}", flush=True)
    subprocess.run(
        ["./scripts/make-shorts-clip.sh", ep_id, "40", ep_label(ep_title), meta["hook"]],
        cwd=BECKY_NEWS, check=True,
    )

    QUEUE_DIR.mkdir(parents=True, exist_ok=True)
    src = BECKY_NEWS / "out" / "shorts" / clip_name
    dst = QUEUE_DIR / clip_name
    dst.write_bytes(src.read_bytes())
    (QUEUE_DIR / f"cast-shorts-{ep_id}.json").write_text(
        json.dumps({"title": meta["yt_title"], "description": meta["yt_description"],
                     "genre": "talking_head"},
                    ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    print(f"[auto-cast-shorts] キュー投入完了: {dst}", flush=True)

    # ニュースShortsは朝イチ公開（19:00キューを待たせない、2026-07-27 ゆう指示）。
    # 既存の shorts_queue.py に対象ファイルを指定して即実行、19:00 cron側の
    # CRAFT切り抜きキューには手を付けない（公開済み分はqueue/から消えるだけ）。
    subprocess.run(
        ["python3", str(BECKY_NEWS.parent / "becky-craft" / "scripts" / "shorts_queue.py"), clip_name],
        check=False,
    )


if __name__ == "__main__":
    main()
