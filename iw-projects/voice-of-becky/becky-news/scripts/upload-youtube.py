#!/usr/bin/env python3
# YouTube Data API v3 アップローダ（videos.insert、OAuth installed app flow）
# 依存（このMacは導入済み）: pip3 install google-api-python-client google-auth-oauthlib
# 初回のみブラウザで同意 → ~/.config/becky-youtube/token.json に保存 → 以後全自動。
# client_secret.json が無い場合は scripts/SETUP-youtube-upload.md（ゆうの5分作業）。
import argparse
import json
import os
import sys

CONF_DIR = os.path.expanduser("~/.config/becky-youtube")
CLIENT_SECRET = os.path.join(CONF_DIR, "client_secret.json")
TOKEN = os.path.join(CONF_DIR, "token.json")
SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def get_creds():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    creds = None
    if os.path.exists(TOKEN):
        creds = Credentials.from_authorized_user_file(TOKEN, SCOPES)
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    if not creds or not creds.valid:
        if not os.path.exists(CLIENT_SECRET):
            sys.exit(
                f"client_secret.json がありません: {CLIENT_SECRET}\n"
                "→ scripts/SETUP-youtube-upload.md の手順（ゆうの手作業・約5分）で作成してください"
            )
        from google_auth_oauthlib.flow import InstalledAppFlow

        flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET, SCOPES)
        creds = flow.run_local_server(port=0)  # 初回のみブラウザ同意
    os.makedirs(CONF_DIR, exist_ok=True)
    with open(TOKEN, "w") as f:
        f.write(creds.to_json())
    os.chmod(TOKEN, 0o600)
    return creds


def main():
    p = argparse.ArgumentParser(description="Upload a video to YouTube")
    p.add_argument("video", help="動画ファイルパス")
    p.add_argument("--title", required=True)
    p.add_argument("--description", default="")
    p.add_argument("--tags", default="", help="カンマ区切り")
    p.add_argument("--privacy", default="public", choices=["public", "unlisted", "private"])
    p.add_argument("--thumbnail", default=None, help="カスタムサムネイル画像（png/jpg、2MB以下）")
    p.add_argument("--publish-at", default=None,
                   help="予約公開の日時（JST、例: 2026-07-08T17:00）。指定すると非公開でアップされ、その時刻に自動公開される")
    p.add_argument("--dry-run", action="store_true", help="リクエスト内容を表示して終了（アップロードしない）")
    a = p.parse_args()

    if not os.path.isfile(a.video):
        sys.exit(f"video not found: {a.video}")

    body = {
        "snippet": {
            "title": a.title,
            "description": a.description,
            "tags": [t.strip() for t in a.tags.split(",") if t.strip()],
            "categoryId": "24",  # Entertainment
        },
        "status": {"privacyStatus": a.privacy, "selfDeclaredMadeForKids": False},
    }
    if a.publish_at:
        # 予約公開: JST → UTC ISO8601。YouTube 側の仕様で privacyStatus は private 必須
        from datetime import datetime, timedelta, timezone
        jst = timezone(timedelta(hours=9))
        dt = datetime.fromisoformat(a.publish_at).replace(tzinfo=jst)
        body["status"]["privacyStatus"] = "private"
        body["status"]["publishAt"] = dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    if a.dry_run:
        print("[dry-run] videos.insert part=snippet,status")
        print(f"[dry-run] file: {os.path.abspath(a.video)} ({os.path.getsize(a.video)} bytes)")
        print(json.dumps(body, ensure_ascii=False, indent=2))
        print(f"[dry-run] credential: client_secret={'あり' if os.path.exists(CLIENT_SECRET) else 'なし'} / token={'あり' if os.path.exists(TOKEN) else 'なし'}")
        return

    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload

    youtube = build("youtube", "v3", credentials=get_creds())
    media = MediaFileUpload(a.video, chunksize=8 * 1024 * 1024, resumable=True)
    req = youtube.videos().insert(part="snippet,status", body=body, media_body=media)
    res = None
    while res is None:
        status, res = req.next_chunk()
        if status:
            print(f"upload {int(status.progress() * 100)}%", file=sys.stderr)
    if a.thumbnail and os.path.isfile(a.thumbnail):
        youtube.thumbnails().set(videoId=res["id"], media_body=MediaFileUpload(a.thumbnail)).execute()
        print(f"thumbnail set: {a.thumbnail}", file=sys.stderr)
    print(f"https://www.youtube.com/watch?v={res['id']}")


if __name__ == "__main__":
    main()
