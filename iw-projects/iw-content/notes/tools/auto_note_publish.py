#!/usr/bin/env python3
"""auto_note_publish.py — 木曜 20:00 の note 自動公開 cron

notes/*-for-note.md をスキャンし、ヘッダの「公開推し」が今日 かつ status が
draft/scheduled の記事を note-post.js で公開する。公開後ヘッダを published へ
書き換え、結果を Telegram でゆうに報告する。

ヘッダは厳密な YAML ではなく日本語混じりテキストなので正規表現でゆるくパースする。

Usage:
  python3 auto_note_publish.py            # 本番（実公開する）— 木曜20:00 cron
  python3 auto_note_publish.py --preflight # 公開せず「対象記事あり/セッション生存」をTelegram通知 — 木曜19:30 cron
  python3 auto_note_publish.py --dry-run  # スキャン+判定+パースだけ。node/公開/Telegramは叩かない
"""
import datetime as dt
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

NOTES_DIR = Path(__file__).resolve().parent.parent          # iw-content/notes/
NOTE_POST = Path(__file__).resolve().parent / "note-post.js"
TELEGRAM_ENV = Path.home() / ".claude" / "channels" / "telegram" / ".env"
TELEGRAM_CHAT_ID = "8983810776"                              # ゆう（becky_probe.py と同じ）
SESSION_MARKER = Path.home() / ".stackchan" / "note-chrome-profile" / ".logged_in"

# 「公開推し: 2026-07-09（木 20:00）」からも「公開推し: 2026-06-14」からも日付だけ拾う
RE_DATE = re.compile(r"公開推し\s*[:：]\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})")
RE_STATUS = re.compile(r"^status\s*[:：]\s*(\S+)", re.MULTILINE)
RE_TITLE = re.compile(r"^タイトル\s*[:：]\s*(.+)$", re.MULTILINE)
RE_PROOFREAD = re.compile(r"^proofread\s*[:：]\s*(\S+)", re.MULTILINE)


def parse_header(path: Path):
    """--- より前のヘッダ部だけをゆるくパース。dict を返す。"""
    raw = path.read_text(encoding="utf-8")
    header = raw.split("\n---", 1)[0]  # 最初の「---」区切りまで
    m_date = RE_DATE.search(header)
    m_status = RE_STATUS.search(header)
    m_title = RE_TITLE.search(header)
    m_proofread = RE_PROOFREAD.search(header)
    push_date = None
    if m_date:
        y, mo, d = (int(x) for x in m_date.groups())
        try:
            push_date = dt.date(y, mo, d)
        except ValueError:
            push_date = None
    return {
        "push_date": push_date,
        "status": (m_status.group(1).strip() if m_status else None),
        "title": (m_title.group(1).strip() if m_title else path.name),
        # フィールドなし = pending 扱い（既存記事は触らず後方互換を保つ）
        "proofread": (m_proofread.group(1).strip() if m_proofread else "pending"),
    }


def find_due(today: dt.date):
    """今日公開すべき記事を返す。"""
    due = []
    for path in sorted(NOTES_DIR.glob("*-for-note.md")):
        h = parse_header(path)
        if h["push_date"] == today and h["status"] in ("draft", "scheduled"):
            due.append((path, h))
    return due


def mark_published(path: Path, today: dt.date, url: str | None):
    """ヘッダを status: published + publishedAt 追記へ書き換える。"""
    raw = path.read_text(encoding="utf-8")
    header, sep, body = raw.partition("\n---")
    header = RE_STATUS.sub("status: published", header, count=1)
    add = f"\npublishedAt: {today.isoformat()}"
    if url:
        add += f"\nurl: {url}"
    header = header.rstrip("\n") + add
    path.write_text(header + sep + body, encoding="utf-8")


def publish(path: Path) -> tuple[bool, str | None]:
    """note-post.js --publish --auto を叩く。(成功, URL) を返す。"""
    proc = subprocess.run(
        ["node", str(NOTE_POST), str(path), "--publish", "--auto"],
        capture_output=True, text=True, timeout=300,
    )
    out = proc.stdout + proc.stderr
    # note-post.js は成功時「✅ 投稿完了！」を出す。最後の「🔗 URL:」を拾う
    ok = proc.returncode == 0 and "投稿完了" in out
    m = re.findall(r"🔗 URL:\s*(\S+)", out)
    return ok, (m[-1] if m else None)


def load_telegram_token() -> str | None:
    if not TELEGRAM_ENV.exists():
        return None
    for line in TELEGRAM_ENV.read_text().splitlines():
        if line.startswith("TELEGRAM_BOT_TOKEN="):
            return line.split("=", 1)[1].strip()
    return None


def send_telegram(text: str) -> bool:
    token = load_telegram_token()
    if not token:
        print("[auto-publish] Telegram token not found", flush=True)
        return False
    data = json.dumps({"chat_id": TELEGRAM_CHAT_ID, "text": text}).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=data, headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10):
            pass
        return True
    except Exception as e:
        print(f"[auto-publish] Telegram 送信失敗: {e}", flush=True)
        return False


def preflight(today: dt.date, dry: bool):
    """公開せず、対象記事とセッション生存をゆうに通知（木曜19:30）。"""
    due = find_due(today)
    session_ok = SESSION_MARKER.exists()
    note = "\n※木曜20時はMacログイン中（常時稼働）前提で自動公開します"
    if due:
        titles = "・".join(h["title"] for _, h in due)
        sess = "✅生存" if session_ok else "⚠️切れの可能性(要ログイン確認)"
        msg = f"🕢 今夜20:00 note自動公開の準備\n対象「{titles}」\nnoteセッション: {sess}{note}"
        if any(h["proofread"] != "done" for _, h in due):
            msg += "\n⚠️校正未確認の記事があります（proofread: pending）"
    else:
        msg = f"🕢 今夜のnote公開予定はありません（{today} 公開推しの下書きなし）"
    print(f"[auto-publish] preflight: {msg}", flush=True)
    if not dry:
        send_telegram(msg)


def main():
    dry = "--dry-run" in sys.argv
    today = dt.date.today()

    if "--preflight" in sys.argv:
        preflight(today, dry)
        return

    tag = "[dry-run] " if dry else ""
    due = find_due(today)

    if not due:
        print(f"[auto-publish] {today} 公開対象なし。終了。", flush=True)
        return

    for path, h in due:
        title = h["title"]
        print(f"[auto-publish] {tag}公開対象: {title} ({path.name})", flush=True)
        if dry:
            print(f"[auto-publish]   → dry-run のため node/公開はスキップ", flush=True)
            continue
        ok, url = publish(path)
        if ok:
            mark_published(path, today, url)
            msg = f"📣 note 自動公開しました\n「{title}」\n{url or ''}".strip()
            if h["proofread"] != "done":
                msg += "\n⚠️校正未確認のまま公開しました"
            send_telegram(msg)
            print(f"[auto-publish]   ✅ 公開完了: {url}", flush=True)
        else:
            send_telegram(
                f"⚠️ note 自動公開に失敗しました\n「{title}」\n手動公開が必要です。ログ確認して。"
            )
            print(f"[auto-publish]   ❌ 公開失敗: {title}", flush=True)


if __name__ == "__main__":
    main()
