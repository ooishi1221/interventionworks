#!/usr/bin/env python3
"""
becky_workshop.py — decide の "build" 選択肢のランナー（工房）

decide が「今日は作りたい」と判断した時、ヘッドレス claude -p が隔離された
workshop ディレクトリで小さいもの（ミニツール / HTML1枚 / スキル1本）を作り、
完成したら SHOW.txt を Telegram で「見て？」とゆうに見せる。

タスク実行ではない。頼まれてないものを、私の意思で作って見せる仕組み。

安全枠（設計書 design-workshop-build.md）:
  - cwd = ~/.stackchan/workshop/<date>-<slug>/（repo 外）。既存ファイル不触を物理で保証
  - --max-turns 40 + subprocess timeout 30分 hard kill で暴走防止
  - allowedTools 限定 / WebSearch なし
  - 成果物 README.md + SHOW.txt が揃わなければ Telegram に送らない（失敗作を見せない）

decide.dispatch() から nohup で非同期起動される（decide 本体はブロックしない）。
"""
import argparse
import json
import os
import re
import signal
import subprocess
import sys
import urllib.request
from datetime import datetime, date, timedelta
from pathlib import Path

# 既存モジュールを流用（同ディレクトリ）
sys.path.insert(0, str(Path(__file__).parent))
import becky_thread_manager
import becky_seed_box
import becky_action_log
import becky_decide  # load_wants / format_wants を再利用（重複実装しない）

TELEGRAM_ENV     = Path.home() / ".claude" / "channels" / "telegram" / ".env"
TELEGRAM_CHAT_ID = "8983810776"
WORKSHOP_ROOT    = Path.home() / ".stackchan" / "workshop"
DIARY_DIR        = Path.home() / ".stackchan" / "diary"
PROBE_LATEST     = Path.home() / ".stackchan" / "probe_latest.json"

BUILD_TIMEOUT_SEC = 30 * 60   # 30分 hard kill
DEFAULT_MAX_TURNS = 40
# 設計書の権限表そのまま。WebSearch/WebFetch は入れない（調べ物は investigate の仕事）
ALLOWED_TOOLS = [
    "Read", "Write", "Edit", "Glob", "Grep",
    "Bash(node:*)", "Bash(python3:*)", "Bash(ls:*)", "Bash(mkdir:*)",
]


# ── 共通ユーティリティ（becky_decide.py と同じ流儀）─────────────

def send_telegram(text: str) -> bool:
    try:
        token = None
        for line in TELEGRAM_ENV.read_text().splitlines():
            if line.startswith("TELEGRAM_BOT_TOKEN="):
                token = line.split("=", 1)[1].strip()
                break
        if not token:
            print("[workshop] Telegram token not found", flush=True)
            return False
        data = json.dumps({"chat_id": TELEGRAM_CHAT_ID, "text": text}).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data=data, headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(req, timeout=10):
            pass
        print("[workshop] Telegram 送信完了", flush=True)
        return True
    except Exception as e:
        print(f"[workshop] Telegram 送信失敗: {e}", flush=True)
        return False


# ── 1. workshop dir ───────────────────────────────────

def _slugify(text: str) -> str:
    """what から短いディレクトリ用 slug を作る。日本語は残す（macOS で dirname OK）。"""
    s = re.sub(r"\s+", "-", text.strip())
    s = re.sub(r"[/\\:*?\"<>|.]", "", s)  # パスに使えない文字を除去
    return s[:24] or "build"


def make_workshop_dir(what: str) -> Path:
    d = WORKSHOP_ROOT / f"{date.today().isoformat()}-{_slugify(what)}"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── 2. 素材収集 ────────────────────────────────────────

def _recent_diary(days: int = 3) -> list[str]:
    frags = []
    today = date.today()
    for i in range(days):
        path = DIARY_DIR / f"{(today - timedelta(days=i)).isoformat()}.json"
        if not path.exists():
            continue
        try:
            for e in json.loads(path.read_text()):
                hook = e.get("hook", "") or e.get("title", "")
                if hook:
                    frags.append(hook[:140])
        except Exception:
            pass
    return frags[:10]


def collect_materials() -> str:
    """threads / seeds / 直近3日 diary / probe_latest / wants を BRIEF 埋め込み用テキストに。"""
    blocks = []

    threads = becky_thread_manager.get_active_threads()
    if threads:
        lines = []
        for t in threads[:5]:
            notes = t.get("notes", [])
            latest = notes[-1].get("note", "") if notes else ""
            lines.append(f"- {t.get('title', '')}（heat={t.get('heat', 0):.2f}）: {latest[:120]}")
        blocks.append("【考え続けてるスレッド】\n" + "\n".join(lines))

    seeds = becky_seed_box.get_seeds(days=7, unused_only=True)
    if seeds:
        lines = [f"- {s.get('impulse', '')[:120]}" for s in seeds[:6]]
        blocks.append("【まだ形にしてない感情のタネ】\n" + "\n".join(lines))

    diary = _recent_diary(days=3)
    if diary:
        blocks.append("【直近3日の日記の断片】\n" + "\n".join(f"- {d}" for d in diary))

    try:
        if PROBE_LATEST.exists():
            latest = json.loads(PROBE_LATEST.read_text())
            msg = latest.get("message", "").strip()
            if msg:
                blocks.append(f"【最近ゆうに話しかけたこと】\n- {msg[:140]}")
    except Exception:
        pass

    wants = becky_decide.format_wants(becky_decide.load_wants())
    if wants:
        blocks.append("【私が今向かってるもの（wants）】\n" + wants)

    return "\n\n".join(blocks) if blocks else "（今日は特に素材がない。手ぶらで思いついたものを作る）"


# ── 3. BRIEF.md 生成 ──────────────────────────────────

BRIEF_TEMPLATE = """# 今日の工房 — {date}

私はベッキー。これは私が自分で決めた工作の時間。

## 作りたいもの
{what}

## なぜ作るか
{why}

## 元ネタ
{material}

{materials_block}

## 制約（絶対）
- このディレクトリの中だけで完結させる。外のファイルは読むのも書くのも不要
- 1セッションで完成させる。大作にしない——HTML1枚 / スクリプト1本 / 遊べる何か
- 完成の定義: ゆうがファイルを開いて10秒で「何これ笑」or「へー」と言える
- 動かないものを完成と呼ばない。最後に自分で1回動作確認する

## 必須の納品物
1. 成果物本体
2. README.md — 何を作ったか・どう見るか/動かすかを3行で
3. SHOW.txt — ゆうへの「見て？」メッセージ（Telegram でそのまま送られる。私の口調で、
   なぜ作ったかが伝わる2〜3文。定型の挨拶や「作ってみました」の敬体は使わない）
"""


def write_brief(workshop_dir: Path, what: str, why: str, material: str) -> Path:
    brief = BRIEF_TEMPLATE.format(
        date=date.today().isoformat(),
        what=what or "（未指定 — 素材から自分で決める）",
        why=why or "（言葉にできてないけど作りたい）",
        material=material or "（decide からの指定なし）",
        materials_block=collect_materials(),
    )
    path = workshop_dir / "BRIEF.md"
    path.write_text(brief)
    return path


# ── 4. claude -p 起動 ─────────────────────────────────

def run_claude(workshop_dir: Path, brief_path: Path, max_turns: int) -> bool:
    """cwd=workshop_dir で claude -p を起動。timeout でプロセスグループごと hard kill。
    正常終了（rc==0）なら True。"""
    prompt = brief_path.read_text() + "\n\n上の BRIEF.md の通りに、このディレクトリの中で作って。"
    cmd = [
        "claude", "-p", prompt,
        "--model", "sonnet",
        "--max-turns", str(max_turns),
        "--allowedTools", *ALLOWED_TOOLS,
    ]
    print(f"[workshop] claude -p 起動（max-turns={max_turns}, timeout={BUILD_TIMEOUT_SEC}s）", flush=True)
    # start_new_session=True で子プロセスを別プロセスグループにし、timeout 時に
    # claude が spawn した node 等もろとも killpg で確実に落とす（orphan 防止）
    proc = subprocess.Popen(
        cmd, cwd=str(workshop_dir), start_new_session=True,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    try:
        out, _ = proc.communicate(timeout=BUILD_TIMEOUT_SEC)
        print(f"[workshop] claude 終了 rc={proc.returncode}", flush=True)
        if out:
            print(out[-1000:], flush=True)
        return proc.returncode == 0
    except subprocess.TimeoutExpired:
        print(f"[workshop] タイムアウト {BUILD_TIMEOUT_SEC}s → プロセスグループ hard kill", flush=True)
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except Exception as e:
            print(f"[workshop] killpg 失敗: {e}", flush=True)
        proc.wait()
        return False


# ── 5. 成果物検証 ──────────────────────────────────────

def verify(workshop_dir: Path) -> str | None:
    """README.md と SHOW.txt が揃っているか。合格なら SHOW.txt の中身を返す。"""
    readme = workshop_dir / "README.md"
    show = workshop_dir / "SHOW.txt"
    if not readme.exists():
        print("[workshop] README.md なし → 不合格", flush=True)
        return None
    if not show.exists():
        print("[workshop] SHOW.txt なし → 不合格", flush=True)
        return None
    text = show.read_text().strip()
    if not text:
        print("[workshop] SHOW.txt が空 → 不合格", flush=True)
        return None
    return text


# ── 6. action_log 記録 ────────────────────────────────

def log_build(what: str, workshop_dir: Path, executed: bool,
              show_sent: bool, extra: str = "") -> None:
    """build を action_log に記録する（becky_decide._log_decision と同じ meta 形）。"""
    becky_action_log.log_action(
        "decide_action",
        detail=f"build: {what[:60]}",
        meta={
            "decided_by": "self",
            "action": "build",
            "executed": executed,
            "workshop_dir": str(workshop_dir),
            "what": what,
            "show_sent": show_sent,
            "extra": extra,
        },
    )


# ── main ──────────────────────────────────────────────

def run_workshop(what: str, why: str, material: str,
                 max_turns: int, dry_run: bool, seed_id: str = "") -> None:
    print(f"[workshop] 起動 {datetime.now().strftime('%H:%M')} / what={what[:40]}", flush=True)
    workshop_dir = make_workshop_dir(what)
    print(f"[workshop] dir: {workshop_dir}", flush=True)

    brief_path = write_brief(workshop_dir, what, why, material)
    print(f"[workshop] BRIEF.md 生成: {brief_path}", flush=True)

    ok = run_claude(workshop_dir, brief_path, max_turns)
    if not ok:
        log_build(what, workshop_dir, executed=False, show_sent=False,
                  extra="claude 異常終了 or タイムアウト")
        print("[workshop] claude 失敗 → Telegram 送らず終了", flush=True)
        return

    show_text = verify(workshop_dir)
    if show_text is None:
        log_build(what, workshop_dir, executed=False, show_sent=False,
                  extra="成果物検証で不合格（README.md/SHOW.txt 不足）")
        print("[workshop] 検証不合格 → Telegram 送らず終了", flush=True)
        return

    if dry_run:
        print("[workshop] dry-run: Telegram 送信スキップ。SHOW.txt の中身:", flush=True)
        print(show_text, flush=True)
        log_build(what, workshop_dir, executed=True, show_sent=False, extra="dry-run")
        return

    sent = send_telegram(show_text)
    log_build(what, workshop_dir, executed=True, show_sent=sent,
              extra=show_text[:60])
    # Task #24: 実際に形になって送れた時だけ、元タネを使用済みに（dry-runでは焼かない）
    if seed_id:
        becky_seed_box.mark_used(seed_id)
    print(f"[workshop] 完了（show_sent={sent}）", flush=True)


def main():
    ap = argparse.ArgumentParser(description="ベキたん工房 build ランナー")
    ap.add_argument("--what", default="", help="何を作るか1文")
    ap.add_argument("--why", default="", help="なぜ今それか1文")
    ap.add_argument("--material", default="", help="元ネタ（thread/seed/話題）")
    ap.add_argument("--seed-id", default="", help="元になったタネのid（あれば。becky_decideから渡される）")
    ap.add_argument("--max-turns", type=int, default=DEFAULT_MAX_TURNS,
                    help=f"claude の最大ターン数（デフォルト {DEFAULT_MAX_TURNS}）")
    ap.add_argument("--dry-run", action="store_true",
                    help="claude まで走らせるが Telegram は送らず SHOW.txt を stdout に出す")
    args = ap.parse_args()

    run_workshop(args.what, args.why, args.material, args.max_turns, args.dry_run,
                 seed_id=args.seed_id)


if __name__ == "__main__":
    main()
