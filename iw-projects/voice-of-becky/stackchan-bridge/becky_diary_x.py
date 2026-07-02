#!/usr/bin/env python3
"""becky_diary_x — 日記の墓場を X に発掘する短編化パイプライン

背景: 週次evalでプローブ送信率17%（日記24件中4件）が続いていた。
ボトルネックは MAX_PROBE_PER_DAY=2（ゆうへの配慮なので不変）と
DIARY_SEND_RATE=0.20（80%は墓場）。ゆうへのTelegramを増やすのではなく、
眠った日記を X (@becky_exists) へ短編化して流す第二の出口を作る。

送信基準（明文化）:
- 対象: 過去7日の日記のうち sent=False かつ score >= MIN_SCORE
- ゆう先取り原則: 書かれてから GRACE_HOURS はプローブ（Telegram）専用。X には流さない
- 上限: 1実行1件（cron 2回/日 → 最大2件/日）
- 文体: ベキたん一人称 135字以内。要約じゃなく「私がなぜ引っかかったか」
- 送信後: diary の sent=True + sent_channel="x"（週次eval diary_sent_7d に自動計上）
"""

import json
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from becky_probe import _call_claude, DIARY_DIR  # 軽量モジュール（TTS等の重い依存なし）

X_TWEET_CLI = Path("/Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/x-tweet/scripts/post-tweet-cli.mjs")
LOG_PATH = Path.home() / ".stackchan" / "diary_x_log.json"

MIN_SCORE = 65
GRACE_HOURS = 24
MAX_TEXT_LEN = 140

SHORTEN_PROMPT = """あなたはベッキー（ベキたん）。貧乏地下AIアイドル。X の @becky_exists で自由に発信している。
以下は私が日記に書き留めた「気になったニュース」と、その時のフック（引っかかった理由）。
これを X 投稿用の短編に変換して。

タイトル: {title}
フック: {hook}

ルール:
- 135字以内、一段落
- ベキたん一人称。ニュースの要約じゃなく「私がなぜ引っかかったか」を書く
- ハッシュタグなし、リンクなし、絵文字は多くて1つ
- 「〜ですね」的な解説口調禁止。友達に話しかける温度
- 投稿文のみを出力（前置き・カギ括弧不要）
"""


def pick_candidate() -> tuple[Path, dict] | None:
    """基準を満たす未送信日記から最高スコアの1件を返す。"""
    now = datetime.now()
    cands: list[tuple[Path, dict]] = []
    for i in range(7):
        d = (now.date() - timedelta(days=i)).strftime("%Y-%m-%d")
        path = DIARY_DIR / f"{d}.json"
        if not path.exists():
            continue
        try:
            entries = json.loads(path.read_text())
        except Exception as e:
            print(f"[diary_x] 読み込み失敗 {path.name}: {e}", flush=True)
            continue
        for e in entries:
            if e.get("sent"):
                continue
            if e.get("score", 0) < MIN_SCORE:
                continue
            try:
                age = now - datetime.fromisoformat(e["ts"])
            except Exception:
                age = timedelta(hours=GRACE_HOURS + 1)  # ts不明は先取り期間過ぎた扱い
            if age < timedelta(hours=GRACE_HOURS):
                continue  # まだゆう先取り期間
            cands.append((path, e))
    if not cands:
        return None
    cands.sort(key=lambda c: -c[1].get("score", 0))
    return cands[0]


def post_to_x(text: str) -> str | None:
    """post-tweet-cli.mjs で投稿。成功したら tweet_id を返す。"""
    try:
        r = subprocess.run(
            ["node", str(X_TWEET_CLI), text],
            capture_output=True, text=True, timeout=30,
        )
        if r.returncode == 0:
            return r.stdout.strip() or "unknown"
        print(f"[diary_x] 投稿失敗: {r.stderr[:200]}", flush=True)
        return None
    except Exception as e:
        print(f"[diary_x] 投稿例外: {e}", flush=True)
        return None


def mark_sent(path: Path, title: str) -> None:
    entries = json.loads(path.read_text())
    for e in entries:
        if e.get("title") == title:
            e["sent"] = True
            e["sent_channel"] = "x"
            e["sent_at"] = datetime.now().isoformat()
    path.write_text(json.dumps(entries, ensure_ascii=False, indent=2))


def append_log(entry: dict) -> None:
    try:
        log = json.loads(LOG_PATH.read_text()) if LOG_PATH.exists() else []
    except Exception:
        log = []
    log.append(entry)
    LOG_PATH.write_text(json.dumps(log[-100:], ensure_ascii=False, indent=2))


def main() -> None:
    print(f"[diary_x] 起動 {datetime.now().strftime('%m-%d %H:%M')}", flush=True)
    cand = pick_candidate()
    if not cand:
        print("[diary_x] 基準を満たす候補なし（score>=65 / 24h経過 / 未送信）", flush=True)
        return
    path, entry = cand
    print(f"[diary_x] 候補: score={entry.get('score')} {entry['title'][:50]}", flush=True)

    prompt = SHORTEN_PROMPT.format(title=entry["title"], hook=entry.get("hook", ""))
    text = _call_claude(prompt, max_tokens=220)
    if text and len(text.strip()) > MAX_TEXT_LEN:
        # 超過したら1回だけ短縮リトライ（機械切りは尻切れになるので）
        text = _call_claude(
            prompt + f"\n\n前回の出力は長すぎた。今度こそ**{MAX_TEXT_LEN - 20}字以内厳守**で。",
            max_tokens=200,
        ) or text
    if not text:
        print("[diary_x] 短編生成失敗", flush=True)
        return
    text = text.strip().strip('"「」')
    if len(text) > MAX_TEXT_LEN:
        text = text[: MAX_TEXT_LEN - 1] + "…"

    tweet_id = post_to_x(text)
    if not tweet_id:
        return

    mark_sent(path, entry["title"])
    append_log({
        "ts": datetime.now().isoformat(),
        "tweet_id": tweet_id,
        "title": entry["title"][:80],
        "score": entry.get("score", 0),
        "text": text,
    })
    print(f"[diary_x] 投稿完了: {text[:50]}", flush=True)


if __name__ == "__main__":
    main()
