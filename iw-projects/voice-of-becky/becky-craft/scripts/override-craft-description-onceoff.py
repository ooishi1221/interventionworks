#!/usr/bin/env python3
# ワンオフ: 2026-07-27に簡素テンプレへ遡及適用した4本(EP.006-009、description空だった分)を
# ゆう指示のリッチ形式(night_pipeline.build_description と同じ形)に上書きする。
# EP.001-005は元のリッチ描写を壊すリスクを避けるため対象外(ゆう指示)。
# 一回実行したら役目終わり、cron化・恒久化は不要(YAGNI)。
#
# 使い方:
#   python3 override-craft-description-onceoff.py           # dry-run
#   python3 override-craft-description-onceoff.py --apply   # 本番実行(videos.update)
import argparse
import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
UPLOAD_SCRIPT = HERE.parent.parent / "becky-news" / "scripts" / "upload-youtube.py"

sys.path.insert(0, str(HERE))
from night_pipeline import build_description  # noqa: E402

_spec = importlib.util.spec_from_file_location("upload_youtube", UPLOAD_SCRIPT)
_upload_youtube = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_upload_youtube)
get_creds = _upload_youtube.get_creds

# ep_num: (video_id, highlight, prev_num, prev_url) — highlightはepisode_summary_ep*.json優先、
# 無ければREADME.mdの備考列から。
#
# ponytail: EP.006(yaJYvGCgxds)/EP.007(n9EiGaqIwp0)はdry-run実測で、今日のシンプルテンプレ適用の
# 対象外だったと判明(既に独自のリッチdescriptionを持っていたため、update-existing-video-meta.pyの
# 「#マインクラフトが既に含まれていればdescription変更をスキップ」ロジックでスルーされた実績あり)。
# EP.001-005と同じ「既にいい説明文があるものは壊さない」原則の対象なのでTARGETSから除外。
# 実際に空→簡素テンプレ化されたのはEP.008/009のみ。
TARGETS = {
    "008": dict(video_id="HUynD8V_SMQ",
                highlight="石のつるはし、ついに完成！",
                prev_num="007", prev_url="https://www.youtube.com/watch?v=n9EiGaqIwp0"),
    "009": dict(video_id="DYndC2IUZIk",
                highlight="無傷で石装備まで進化",
                prev_num="008", prev_url="https://www.youtube.com/watch?v=HUynD8V_SMQ"),
}


def build_readme_stub(prev_num: str, prev_url: str) -> str:
    """build_description() の prev_episode_url() がURLを拾えるだけの最小README断片。"""
    return f"| EP | タイトル | URL | 備考 |\n|---|---|---|---|\n| {prev_num} | dummy | {prev_url} | dummy |\n"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--apply", action="store_true")
    args = p.parse_args()

    from googleapiclient.discovery import build

    youtube = build("youtube", "v3", credentials=get_creds())
    video_ids = [t["video_id"] for t in TARGETS.values()]
    res = youtube.videos().list(part="snippet", id=",".join(video_ids)).execute()
    snippets = {v["id"]: v["snippet"] for v in res["items"]}

    for ep_num, t in TARGETS.items():
        snippet = snippets.get(t["video_id"])
        if snippet is None:
            print(f"EP.{ep_num} ({t['video_id']}): YouTube側に見つからずスキップ")
            continue
        readme_stub = build_readme_stub(t["prev_num"], t["prev_url"])
        new_desc = build_description(ep_num, {"highlight": t["highlight"]}, readme_stub)
        print(f"--- EP.{ep_num} ({t['video_id']}) ---")
        print(f"  before: {snippet.get('description', '')!r}")
        print(f"  after:  {new_desc!r}\n")

        if args.apply:
            new_snippet = dict(snippet)
            new_snippet["description"] = new_desc
            youtube.videos().update(
                part="snippet", body={"id": t["video_id"], "snippet": new_snippet}
            ).execute()
            print(f"  updated: https://www.youtube.com/watch?v={t['video_id']}\n")

    if not args.apply:
        print("[dry-run] 上記を確認してから --apply を付けて再実行してください。")


if __name__ == "__main__":
    main()
