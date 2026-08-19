#!/usr/bin/env python3
"""タスク管理は private repo ooishi1221/iw-tasks (GitHub Issues) へ移行済み。
このスクリプトは公開して安全な集計だけを2ファイルに書き出す。
- task_summary.json: 件数のみ（タイトル・取引先名は含まない）
- activity.json: `public` ラベルが付いた scope:IW issue のみ（明示オプトイン方式。
  既定は非公開。scope:IW でも public が無ければ出さない — 除外フィルタ方式は
  「人が毎回気をつける」前提で漏れるため採用しない）
"""
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = "ooishi1221/iw-tasks"
OUT_DIR = Path(__file__).resolve().parent.parent


def fetch_issues():
    out = subprocess.run(
        ["gh", "issue", "list", "-R", REPO, "--state", "open",
         "--json", "number,title,labels,updatedAt", "--limit", "200"],
        capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


def label_names(issue):
    return {l["name"] for l in issue.get("labels", [])}


def build(issues):
    today = datetime.now(timezone.utc).astimezone().date().isoformat()

    waiting = sum(1 for i in issues if "waiting" in label_names(i))
    pending = sum(1 for i in issues if "pending" in label_names(i))
    iw = sum(1 for i in issues if "scope:IW" in label_names(i))
    wo = sum(1 for i in issues if "scope:WO" in label_names(i))

    summary = {
        "updated_at": today,
        "open": len(issues),
        "waiting": waiting,
        "pending": pending,
        "iw": iw,
        "wo": wo,
        "repo_url": f"https://github.com/{REPO}/issues",
    }

    public_issues = [i for i in issues if {"scope:IW", "public"} <= label_names(i)]
    public_issues.sort(key=lambda i: i["updatedAt"], reverse=True)
    items = []
    for i in public_issues[:8]:
        labels = label_names(i)
        tag = "WAIT" if ("waiting" in labels or "pending" in labels) else "NOW"
        items.append({
            "date": i["updatedAt"][:10],
            "tag": tag,
            "title": i["title"],
        })
    activity = {"updated_at": today, "items": items}

    return summary, activity


def main():
    issues = fetch_issues()
    summary, activity = build(issues)
    (OUT_DIR / "task_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (OUT_DIR / "activity.json").write_text(
        json.dumps(activity, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps(activity, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
