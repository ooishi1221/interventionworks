#!/usr/bin/env python3
# ワンオフ: 既存公開済みBECKY CRAFT本編動画にSEO対応(【マインクラフト】タイトル前置き+
# ハッシュタグ説明文+tags)を遡及適用する。一回実行したら役目終わり、cron化・恒久化は不要(YAGNI)。
#
# 使い方:
#   python3 update-existing-video-meta.py           # dry-run（変更内容を表示するだけ）
#   python3 update-existing-video-meta.py --apply    # 本番実行（videos.update を叩く）
import argparse
import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
UPLOAD_SCRIPT = HERE.parent.parent / "becky-news" / "scripts" / "upload-youtube.py"

# ponytail: ファイル名にハイフンがあり通常importできないのでimportlibでロード。
# get_creds() を再利用するだけ、認証ロジックの二重実装を避ける。
_spec = importlib.util.spec_from_file_location("upload_youtube", UPLOAD_SCRIPT)
_upload_youtube = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_upload_youtube)
get_creds = _upload_youtube.get_creds

CHANNEL_ID = "UCFvpdUWDpmSLTTbv6kiIfNQ"  # @voice_of_becky（stackchan-bridge/platform_scraper.py と同じ）
TITLE_MARK = "【マインクラフト】"
TITLE_FILTER = "BECKY CRAFT"  # このタイトル部分文字列を含む動画だけが対象（Cast/切り抜きは含まない）
HASHTAGS = "#マインクラフト #Minecraft #マイクラ #AI #BECKYCRAFT"
DESC_APPEND = (
    "AIが完全自動でマインクラフトをプレイ・実況する番組「BECKY CRAFT」。\n"
    "台本もプレイ操作もAIが自律的に判断して収録しています。\n\n"
    f"{HASHTAGS}"
)
NEW_TAGS = ["マインクラフト", "Minecraft", "マイクラ", "AI", "自動実況", "BECKY CRAFT"]


def list_target_videos(youtube) -> list[dict]:
    """アップロード済み動画全件からタイトルに TITLE_FILTER を含むものだけ抽出。"""
    uploads = (
        youtube.channels().list(part="contentDetails", id=CHANNEL_ID).execute()
        ["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
    )
    video_ids, page_token = [], None
    while True:
        res = youtube.playlistItems().list(
            playlistId=uploads, part="snippet", maxResults=50, pageToken=page_token
        ).execute()
        for item in res["items"]:
            if TITLE_FILTER in item["snippet"]["title"]:
                video_ids.append(item["snippet"]["resourceId"]["videoId"])
        page_token = res.get("nextPageToken")
        if not page_token:
            break

    videos = []
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i : i + 50]
        res = youtube.videos().list(part="snippet", id=",".join(batch)).execute()
        videos.extend(res["items"])
    return videos


def build_new_snippet(snippet: dict) -> dict:
    new = dict(snippet)
    if TITLE_MARK not in new["title"]:
        new["title"] = TITLE_MARK + new["title"]
    if "#マインクラフト" not in (new.get("description") or ""):
        new["description"] = (new.get("description") or "").rstrip()
        new["description"] = (new["description"] + "\n\n" + DESC_APPEND).lstrip("\n")
    existing_tags = new.get("tags") or []
    new["tags"] = existing_tags + [t for t in NEW_TAGS if t not in existing_tags]
    return new


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--apply", action="store_true", help="実際に videos.update を実行する（省略時は dry-run）")
    args = p.parse_args()

    from googleapiclient.discovery import build

    youtube = build("youtube", "v3", credentials=get_creds())
    videos = list_target_videos(youtube)
    print(f"対象動画: {len(videos)} 本（想定quota: 一覧取得 数unit + update {len(videos)}本×50unit = {len(videos)*50}unit）\n")

    for v in videos:
        old, new = v["snippet"], build_new_snippet(v["snippet"])
        print(f"--- {v['id']} ---")
        print(f"  title: {old['title']!r}\n   →     {new['title']!r}")
        print(f"  description: {old.get('description', '')!r}\n   →          {new['description']!r}")
        print(f"  tags: {old.get('tags')!r}\n   →    {new['tags']!r}")
        print()

        if args.apply:
            youtube.videos().update(part="snippet", body={"id": v["id"], "snippet": new}).execute()
            print(f"  updated: https://www.youtube.com/watch?v={v['id']}\n")

    if not args.apply:
        print("[dry-run] 上記の変更を確認してから --apply を付けて再実行してください。")


if __name__ == "__main__":
    main()
