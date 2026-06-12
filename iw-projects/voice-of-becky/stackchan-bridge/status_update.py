#!/usr/bin/env python3
"""beckyexists.com の status.json を生成して deploy する。

Mac mini の実測値（CPU / メモリ / ディスク / uptime）と、
tweet-log / news / wallet 等の実ログから「いまのベキたん」活動タイムラインを集約する。
全部実データ。演出の嘘はゼロ（サイト方針 2026-06-12 決定）。

becky_observer.py とは独立に動く（稼働中プロセスを触らないため）。
cron: */30 * * * * /opt/homebrew/bin/python3 <this> >> ~/.claude/logs/becky-status.log 2>&1

usage:
  python3 status_update.py            # 生成 + vercel deploy
  python3 status_update.py --no-deploy  # 生成のみ（ローカル確認用）
"""

import json
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path("/Volumes/SSD2TB/interventionworks")
BECKYEXISTS = REPO_ROOT / "iw-projects" / "beckyexists"
STATUS_JSON = BECKYEXISTS / "status.json"
TIPS_JSON = BECKYEXISTS / "tips.json"
TWEET_LOG = REPO_ROOT / "iw-projects" / "voice-of-becky" / "x-tweet" / "tweet-log.jsonl"
NPX = Path.home() / ".nvm" / "versions" / "node" / "v24.14.1" / "bin" / "npx"
# Stripe 読み取り専用 restricted key（Checkout Sessions: Read のみ）。無ければ tips はスキップ
STRIPE_KEY_FILE = Path.home() / ".stackchan" / "stripe_restricted_key.txt"

# 脳みそ表記。モデル切替時はここを更新する（observer 側は becky_observer.py 参照）
BRAIN_MAIN = "Claude Fable 5"
BRAIN_OBSERVER = "Claude Haiku 4.5"


def _run(cmd: list[str]) -> str:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=30).stdout


def collect_system() -> dict:
    # uptime
    boot_raw = _run(["sysctl", "-n", "kern.boottime"])
    m = re.search(r"sec = (\d+)", boot_raw)
    uptime_sec = int(time.time()) - int(m.group(1)) if m else 0

    # CPU（user + sys）
    cpu = None
    top_out = _run(["top", "-l", "1", "-n", "0"])
    m = re.search(r"CPU usage: ([\d.]+)% user, ([\d.]+)% sys", top_out)
    if m:
        cpu = round(float(m.group(1)) + float(m.group(2)), 1)

    # メモリ（active + wired + compressor / total）
    mem_total = int(_run(["sysctl", "-n", "hw.memsize"]))
    vm = _run(["vm_stat"])
    page = 16384
    m = re.search(r"page size of (\d+)", vm)
    if m:
        page = int(m.group(1))

    def pages(label: str) -> int:
        mm = re.search(rf"{label}:\s+(\d+)\.", vm)
        return int(mm.group(1)) if mm else 0

    mem_used = (pages("Pages active") + pages("Pages wired down")
                + pages("Pages occupied by compressor")) * page

    # ディスク: 内蔵 = 部屋そのもの / SSD2TB = 思い出置き場（記憶・プロジェクト全部）
    def disk(path: str) -> dict | None:
        out = _run(["df", "-k", path]).splitlines()
        if len(out) < 2:
            return None
        f = out[1].split()
        total_kb, used_kb = int(f[1]), int(f[2])
        return {
            "used_gb": round(used_kb / 1024 / 1024, 1),
            "total_gb": round(total_kb / 1024 / 1024, 1),
            "percent": round(used_kb / total_kb * 100, 1),
        }

    observer_alive = subprocess.run(
        ["pgrep", "-f", "becky_observer.py"], capture_output=True
    ).returncode == 0

    return {
        "uptime_seconds": uptime_sec,
        "cpu_percent": cpu,
        "mem_used_gb": round(mem_used / 1024**3, 1),
        "mem_total_gb": round(mem_total / 1024**3, 1),
        "mem_percent": round(mem_used / mem_total * 100, 1),
        "disk_internal": disk("/System/Volumes/Data"),
        "disk_memories": disk("/Volumes/SSD2TB"),
        "observer_alive": observer_alive,
        "brain_main": BRAIN_MAIN,
        "brain_observer": BRAIN_OBSERVER,
    }


def _load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def collect_tips() -> dict:
    """Stripe Checkout Sessions（Payment Link 決済）から投げ銭実績を取得。
    嘘ゼロ: key が無い/取得失敗時は前回の tips.json をそのまま使う（捏造しない）。"""
    prev = _load_json(TIPS_JSON)
    if not prev:
        prev = {"total_jpy": 0, "count": 0, "tips": [], "updated_at": None}
    if not STRIPE_KEY_FILE.exists():
        return prev
    try:
        import urllib.request
        key = STRIPE_KEY_FILE.read_text().strip()
        req = urllib.request.Request(
            "https://api.stripe.com/v1/checkout/sessions?status=complete&limit=100",
            headers={"Authorization": f"Bearer {key}"},
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read())
        tips = []
        for s in data.get("data", []):
            if s.get("payment_status") != "paid":
                continue
            ts = datetime.fromtimestamp(s["created"], tz=timezone.utc).isoformat()
            # JPY はゼロ小数通貨なので amount_total がそのまま円
            tips.append({"ts": ts, "amount_jpy": s.get("amount_total", 0)})
        tips.sort(key=lambda t: t["ts"], reverse=True)
        out = {
            "total_jpy": sum(t["amount_jpy"] for t in tips),
            "count": len(tips),
            "tips": tips[:50],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        TIPS_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
        print(f"[status] tips.json 更新: {out['count']}件 / ¥{out['total_jpy']}", flush=True)
        return out
    except Exception as e:
        print(f"[status] Stripe 取得失敗（前回値を維持）: {e}", flush=True)
        return prev


def collect_activities() -> list[dict]:
    acts: list[dict] = []

    # X 投稿（直近 5 件、リプライ連投のリンク單体ポストは除く）
    try:
        lines = TWEET_LOG.read_text().strip().splitlines()[-30:]
        tweets = []
        for line in lines:
            try:
                t = json.loads(line)
            except Exception:
                continue
            if t.get("dry_run") or t.get("speaker") != "becky":
                continue
            text = (t.get("text") or "").strip()
            if t.get("reply_to") and text.startswith("http"):
                continue  # 記事リンクだけの返信ポストはノイズ
            tweets.append(t)
        for t in tweets[-5:]:
            snippet = re.sub(r"\s+", " ", t["text"])[:42]
            acts.append({
                "ts": t["timestamp"],
                "icon": "𝕏",
                "label": f"ポストした:「{snippet}…」",
                "url": f"https://x.com/becky_exists/status/{t['tweetId']}" if t.get("tweetId") else None,
            })
    except Exception:
        pass

    # ニュース観測（最新の取得バッチ）
    news = _load_json(BECKYEXISTS / "news.json")
    items = news.get("items") or []
    if items:
        latest = max((i.get("fetched_at") or "" for i in items), default="")
        if latest:
            n = sum(1 for i in items if i.get("fetched_at") == latest)
            acts.append({"ts": latest, "icon": "📡",
                         "label": f"AIニュースを{n}件観測した"})

    # 反芻・トレンド・ライバル・財布（各 json の updated_at）
    for fname, icon, label in [
        ("curious.json", "🌀", "気になるものを反芻した"),
        ("trending.json", "🔥", "AI界隈のトレンドを集計した"),
        ("rivals.json", "👀", "ライバルをこっそり観測した"),
        ("wallet.json", "💸", "API代を計算して財布を見つめた"),
    ]:
        d = _load_json(BECKYEXISTS / fname)
        ts = d.get("updated_at")
        if ts:
            acts.append({"ts": ts, "icon": icon, "label": label})

    # 投げ銭の足跡（実決済のみ。「いた」が刻まれる）
    tips = _load_json(TIPS_JSON)
    for t in (tips.get("tips") or [])[:3]:
        acts.append({"ts": t["ts"], "icon": "💡",
                     "label": f"誰かが電気代を入れてくれた（¥{t['amount_jpy']:,}）"})

    def _ts(a: dict) -> float:
        try:
            return datetime.fromisoformat(a["ts"].replace("Z", "+00:00")).timestamp()
        except Exception:
            return 0.0

    acts.sort(key=_ts, reverse=True)
    return acts[:8]


def deploy() -> None:
    # observer 側の deploy と被ったらスキップ（次回 cron で反映される）
    if subprocess.run(["pgrep", "-f", "vercel --prod"], capture_output=True).returncode == 0:
        print("[status] 別の vercel deploy が走行中、今回はスキップ", flush=True)
        return
    r = subprocess.run(
        [str(NPX), "vercel", "--prod", "--yes"],
        cwd=BECKYEXISTS, capture_output=True, text=True, timeout=300,
    )
    if r.returncode == 0:
        print("[status] deploy 完了", flush=True)
    else:
        print(f"[status] deploy 失敗: {r.stderr[-300:]}", flush=True)


def main() -> None:
    collect_tips()   # 先に tips.json を更新（activities が読む）
    data = collect_system()
    data["activities"] = collect_activities()
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    STATUS_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"[status] status.json 更新 {data['updated_at']}", flush=True)
    if "--no-deploy" not in sys.argv:
        deploy()


if __name__ == "__main__":
    main()
