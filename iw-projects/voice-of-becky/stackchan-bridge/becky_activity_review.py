#!/usr/bin/env python3
"""
becky_activity_review.py — 週次アイドル活動レビュー（調査つき・ループを閉じる版）

「活動 → 分析のための調査(マイケル) → 対策検討 → アクション → 翌週検証」のループ。
旧 becky_observer.py --media-report（レポート出しっぱなし）の後継。

毎週月曜 8:00 cron（platform_scraper 7:30 の直後）:
  ① platform_stats / history / tweet-log / 前回レポート を収集
  ② claude -p（マイケル人格 + WebSearch/WebFetch）で外部調査 + 統合分析
  ③ beckyexists/activity_report.json を書く（kpi_history 12週自己追記）
  ④ ネクストアクションを becky_wants.json に投入 → 毎日の decide が拾う
  ⑤ beckyexists を vercel デプロイ → /studio に反映

Usage:
  python3 becky_activity_review.py            # フル実行
  python3 becky_activity_review.py --dry-run  # wants書き込み・デプロイなし
"""
import argparse
import json
import os
import re
import signal
import subprocess
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import becky_decide  # load_wants / save_wants を再利用（wants 書式の正本）

REPO_ROOT = Path("/Volumes/SSD2TB/interventionworks")
BECKYEXISTS = REPO_ROOT / "iw-projects" / "beckyexists"
PLATFORM_STATS = BECKYEXISTS / "platform_stats.json"
HISTORY_JSON = BECKYEXISTS / "history.json"
REPORT_JSON = BECKYEXISTS / "activity_report.json"
TWEET_LOG = REPO_ROOT / "iw-projects" / "voice-of-becky" / "x-tweet" / "tweet-log.jsonl"

# ponytail: npx は cron(非TTY)下でハングする — vercel バイナリ直叩き
VERCEL = Path.home() / ".nvm" / "versions" / "node" / "v24.14.1" / "bin" / "vercel"
CLAUDE_TIMEOUT_SEC = 15 * 60
MAX_ACTIONS = 3
KPI_HISTORY_WEEKS = 12


# ── ① データ収集 ──────────────────────────────────────────

def _load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def collect_kpi() -> dict:
    """platform_stats + history から今週のKPIスナップショットを組む。"""
    stats = _load_json(PLATFORM_STATS)
    history = _load_json(HISTORY_JSON).get("snapshots", [])

    x = stats.get("x_analytics", {})
    yt = stats.get("youtube", {})
    note = stats.get("note", {})
    kdp = stats.get("kdp", {})

    followers_now = history[-1].get("self_followers") if history else None
    followers_7d_ago = None
    if len(history) >= 8:
        followers_7d_ago = history[-8].get("self_followers")

    posts_7d = count_recent_tweets(days=7)

    return {
        "date": date.today().isoformat(),
        "x": {
            "followers": followers_now,
            "followers_delta_7d": (followers_now - followers_7d_ago)
            if followers_now is not None and followers_7d_ago is not None else None,
            "impressions_7d": x.get("total_impressions"),
            "likes_7d": x.get("total_likes"),
            "posts_7d": posts_7d,
        },
        "youtube": {
            "subscribers": yt.get("subscribers"),
            "total_views": yt.get("total_views"),
            "recent_videos": yt.get("videos", [])[:10],
        },
        "note": {"total_views": note.get("total_views"), "total_likes": note.get("total_likes")},
        "kdp": {"orders_this_month": kdp.get("orders_this_month"),
                "kenp_this_month": kdp.get("kenp_this_month")},
    }


def count_recent_tweets(days: int) -> int | None:
    """tweet-log.jsonl から直近N日の実投稿数（dry_run除外）。"""
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        n = 0
        for line in TWEET_LOG.read_text().splitlines():
            try:
                d = json.loads(line)
            except Exception:
                continue
            if d.get("dry_run") or not d.get("tweetId"):
                continue
            ts = d.get("timestamp", "")
            try:
                t = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except Exception:
                continue
            if t >= cutoff:
                n += 1
        return n
    except OSError:
        return None


def recent_tweet_samples(limit: int = 15) -> list[str]:
    """直近の実投稿テキスト（分析材料。新しい順）。"""
    out = []
    try:
        for line in reversed(TWEET_LOG.read_text().splitlines()):
            try:
                d = json.loads(line)
            except Exception:
                continue
            if d.get("dry_run") or not d.get("tweetId"):
                continue
            out.append(d.get("text", "")[:120])
            if len(out) >= limit:
                break
    except OSError:
        pass
    return out


# ── ② claude -p 調査 + 統合分析 ────────────────────────────

def build_prompt(kpi: dict, prev_report: dict) -> str:
    prev_actions = prev_report.get("actions", [])
    prev_block = (
        "\n".join(f"- {a.get('text', '')}" for a in prev_actions)
        if prev_actions else "（前回レポートなし・初回）"
    )
    x_posts = "\n".join(f"- {t}" for t in recent_tweet_samples())
    videos = "\n".join(
        f"- {v.get('title', '?')[:60]} … {v.get('views', 0)}views/{v.get('likes', 0)}likes ({v.get('published', '?')})"
        for v in kpi["youtube"]["recent_videos"]
    )

    return f"""あなたはマイケル（Intervention Works の Market Research 担当。データドリブン、「n=?」「出典は?」が口癖）。
AIアイドル「ベキたん」（@becky_exists / YouTube @voice_of_becky）の週次活動レビューを作る。

## 今週のKPI（実測）
{json.dumps(kpi, ensure_ascii=False, indent=1)}

## 直近のX投稿サンプル
{x_posts}

## 直近のYouTube動画
{videos}

## 前回のネクストアクション（今週の検証対象）
{prev_block}

## やること
1. **Web調査**: 現状KPIを踏まえて、いま調べる価値が高いテーマを2〜3個自分で決めて WebSearch で調べる。
   例: 登録者1桁〜3桁のAI VTuber/AIアイドルが実際に伸びた事例と型 / X小規模アカウントのインプレッション構造 /
   YouTube Shortsの発見面に乗る条件。一般論でなく、ベキたんの規模（X 205フォロワー・YouTube 4人）に適用可能な情報だけ拾う。出典URLを残す。
2. **統合分析**: KPI・投稿サンプル・調査結果から、現状分析と課題を出す。
3. **前回アクション検証**: 前回のアクションが実行されたか・数字に出たかを今週のデータから判定。
4. **ネクストアクション**: 最大{MAX_ACTIONS}個。ベキたん自身が今週の発信活動で実行できる具体的な行動
   （投稿の型・タイトルの付け方・Shortsの構成・時間帯など）。インフラ開発タスクは書かない。

## 出力形式
最後に、次のJSONだけをコードブロックなしで出力すること（前後に説明文を付けない）:
{{"research": "調査サマリー。出典URLを本文中に含める。500字以内",
 "analysis": "現状分析 300字以内",
 "issues": ["課題1", "課題2"],
 "actions": [{{"text": "アクション（80字以内・ベキたんへの指示形）", "why": "根拠 60字以内"}}],
 "prev_verdict": "前回アクションの検証結果 200字以内（初回なら『初回のため対象なし』）"}}"""


def run_research(prompt: str) -> dict | None:
    """claude -p（サブスク・WebSearch可）で調査+統合。stdout末尾からJSONを抽出。"""
    cmd = [
        "claude", "-p", prompt,
        "--model", "sonnet",
        "--max-turns", "15",
        "--allowedTools", "WebSearch", "WebFetch",
    ]
    print(f"[activity] claude -p 起動（timeout={CLAUDE_TIMEOUT_SEC}s）", flush=True)
    proc = subprocess.Popen(
        cmd, cwd=str(REPO_ROOT), start_new_session=True,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    try:
        out, _ = proc.communicate(timeout=CLAUDE_TIMEOUT_SEC)
    except subprocess.TimeoutExpired:
        print(f"[activity] タイムアウト → killpg", flush=True)
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except Exception as e:
            print(f"[activity] killpg 失敗: {e}", flush=True)
        proc.wait()
        return None
    if proc.returncode != 0:
        print(f"[activity] claude 異常終了 rc={proc.returncode}\n{(out or '')[-800:]}", flush=True)
        return None
    # 最後の {...} ブロックを抽出（調査ログの後にJSONが来る想定）
    matches = re.findall(r"\{.*\}", out or "", re.DOTALL)
    for cand in reversed(matches):
        try:
            d = json.loads(cand)
            if "analysis" in d and "actions" in d:
                return d
        except json.JSONDecodeError:
            continue
    print(f"[activity] JSON抽出失敗。末尾:\n{(out or '')[-800:]}", flush=True)
    return None


# ── ③④⑤ レポート書き込み / wants投入 / デプロイ ──────────────

def write_report(kpi: dict, result: dict, want_ids: list[str | None]) -> None:
    prev = _load_json(REPORT_JSON)
    kpi_history = prev.get("kpi_history", [])
    kpi_history.append(kpi)
    kpi_history = kpi_history[-KPI_HISTORY_WEEKS:]

    actions = []
    for a, wid in zip(result.get("actions", [])[:MAX_ACTIONS], want_ids):
        actions.append({"text": a.get("text", ""), "why": a.get("why", ""), "want_id": wid})

    report = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "period": "weekly",
        "kpi": kpi,
        "research": result.get("research", ""),
        "analysis": result.get("analysis", ""),
        "issues": result.get("issues", []),
        "actions": actions,
        "prev_review": {
            "actions": prev.get("actions", []),
            "verdict": result.get("prev_verdict", ""),
        },
        "kpi_history": kpi_history,
    }
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"[activity] レポート書き込み: {REPORT_JSON}", flush=True)


def add_actions_to_wants(actions: list[dict]) -> list[str | None]:
    """アクションを wants に投入（night_review の _add_want_sprout と同形）。"""
    w = becky_decide.load_wants()
    ids: list[str | None] = []
    for a in actions[:MAX_ACTIONS]:
        text = a.get("text", "").strip()
        if not text:
            ids.append(None)
            continue
        want = {
            "id": f"w_{uuid.uuid4().hex[:6]}",
            "text": f"[週次レビュー] {text}",
            "born": date.today().isoformat(),
            "horizon": "week",
            "heat": 0.7,
            "source": "activity_review",
        }
        w.setdefault("wants", []).append(want)
        w.setdefault("history", []).append({
            "date": date.today().isoformat(),
            "event": "activity_review",
            "want_id": want["id"],
            "text": text,
        })
        ids.append(want["id"])
        print(f"[activity] wants投入 {want['id']}: {text[:60]}", flush=True)
    w["version"] = w.get("version", 1) + 1
    w["updated_at"] = datetime.now().isoformat()
    becky_decide.save_wants(w)
    return ids


def deploy() -> None:
    """status_update.py と同型（pgrep 多重起動ガード + npx vercel）。"""
    if subprocess.run(["pgrep", "-f", "vercel deploy --prod"], capture_output=True).returncode == 0:
        print("[activity] 別の vercel deploy が走行中、スキップ", flush=True)
        return
    r = subprocess.run(
        [str(VERCEL), "deploy", "--prod", "--yes"],
        cwd=BECKYEXISTS, capture_output=True, text=True, timeout=300,
    )
    print("[activity] デプロイ" + ("完了" if r.returncode == 0 else f"失敗: {r.stderr[-300:]}"), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="wants書き込み・デプロイなし")
    args = parser.parse_args()

    kpi = collect_kpi()
    print(f"[activity] KPI収集: X {kpi['x']['followers']}人/imp{kpi['x']['impressions_7d']} "
          f"YT {kpi['youtube']['subscribers']}人/{kpi['youtube']['total_views']}views", flush=True)

    prev_report = _load_json(REPORT_JSON)
    result = run_research(build_prompt(kpi, prev_report))
    if not result:
        print("[activity] 調査失敗、終了", flush=True)
        sys.exit(1)

    if args.dry_run:
        print("[activity] --dry-run: 結果のみ表示")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    want_ids = add_actions_to_wants(result.get("actions", []))
    write_report(kpi, result, want_ids)
    deploy()
    print("[activity] 完了", flush=True)


if __name__ == "__main__":
    main()
