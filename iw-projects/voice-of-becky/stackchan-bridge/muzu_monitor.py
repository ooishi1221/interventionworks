#!/usr/bin/env python3
"""
muzu_monitor.py — curiosity engine（むずむず度監視デーモン）

監視ソース:
  - 最後の会話からの経過時間
  - git commit の変化量（直近 1h のどのプロジェクトを触ってたか）
  - ~/.stackchan/becky_todo.txt （ベッキーの積み残しTODO）

スコア閾値（30）を超えたら claude -p でベッキーが考えて、
スタックちゃんの声 + Telegram に届ける。

todo があればアイドル 1h で優先発動。
スコア 30〜50 かつ todo なし → 20% でスキップ（「今日はやめとく」気分）。

Usage:
    python3 muzu_monitor.py [--test]

    --test: 閾値を 5 分に短縮してすぐ動作確認できるモード

アーキテクチャ (チャッピーアドバイス 2026-06-08):
    「発火条件」より「ベッキーの関心事」から話しかける設計を目指す。
    todo = ずっと気になってたことをやっと聞ける温度感。
    idle = 放置された感・寂しい方向のトーン（仕事の話ではなく）。
    次: interest watcher（ファイル変化をプロジェクト別に監視）。
"""
import argparse
import subprocess
import sys
import time
import urllib.request
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from stop_hook_tts import speak, load_config

LAST_CONV_FILE  = Path.home() / ".stackchan" / "last_conversation.txt"
TRIGGER_FILE    = Path("/tmp/becky_muzu_triggered")
MUZU_FLAG_FILE  = Path("/tmp/becky_muzu_enabled")
BECKY_TODO_FILE = Path.home() / ".stackchan" / "becky_todo.txt"
REPO_ROOT = Path("/Volumes/SSD2TB/interventionworks")

TELEGRAM_ENV    = Path.home() / ".claude" / "channels" / "telegram" / ".env"
TELEGRAM_CHAT_ID = "8983810776"


def _load_telegram_token() -> str | None:
    try:
        for line in TELEGRAM_ENV.read_text().splitlines():
            if line.startswith("TELEGRAM_BOT_TOKEN="):
                return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None


def send_telegram(text: str) -> None:
    token = _load_telegram_token()
    if not token:
        print("[muzu] Telegram token not found, skip", flush=True)
        return
    import json as _json
    data = _json.dumps({"chat_id": TELEGRAM_CHAT_ID, "text": text}).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10):
            pass
        print("[muzu] Telegram 送信完了", flush=True)
    except Exception as e:
        print(f"[muzu] Telegram 送信失敗: {e}", flush=True)

CHECK_INTERVAL = 300  # 5分ごとにチェック


def pick_todo() -> str | None:
    """todo の先頭1件を返す。なければ None。"""
    if not BECKY_TODO_FILE.exists():
        return None
    lines = [l.strip() for l in BECKY_TODO_FILE.read_text().splitlines() if l.strip()]
    return lines[0] if lines else None


def consume_todo() -> None:
    """喋った todo の先頭1件を削除する。"""
    if not BECKY_TODO_FILE.exists():
        return
    lines = [l.strip() for l in BECKY_TODO_FILE.read_text().splitlines() if l.strip()]
    if lines:
        BECKY_TODO_FILE.write_text("\n".join(lines[1:]) + ("\n" if len(lines) > 1 else ""))

# プロジェクト判定マップ（パスの一部 → 表示名）
PROJECT_MAP = {
    "KUROKO": "KUROKO",
    "kuroko": "KUROKO",
    "vibely": "Vibely",
    "slight": "Slight",
    "moto-logos": "Moto-Logos",
    "iw-local": "iw-local",
    "vibe-guard": "Vibe-Guard",
    "voice-of-becky": "Voice of Becky",
    "iw-content": "note 連載",
}


def get_idle_hours() -> float:
    if not LAST_CONV_FILE.exists():
        return 0.0
    try:
        last_ts = float(LAST_CONV_FILE.read_text().strip())
        return (time.time() - last_ts) / 3600
    except (ValueError, OSError):
        return 0.0


def get_git_activity() -> dict:
    """直近 1h の git commit 変化量を取得。どのプロジェクトを触ってたか判定する。"""
    try:
        result = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "log", "--since=1 hour ago", "--name-only", "--oneline", "--all"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return {"commits": 0, "top_project": None}

        lines = result.stdout.strip().splitlines()
        commits = sum(1 for l in lines if l and not l.startswith(" ") and len(l.split()) >= 2 and len(l.split()[0]) == 7)
        project_counts: Counter = Counter()
        for line in lines:
            for key, name in PROJECT_MAP.items():
                if key in line:
                    project_counts[name] += 1
                    break

        top_project = project_counts.most_common(1)[0][0] if project_counts else None
        return {"commits": commits, "top_project": top_project, "project_counts": dict(project_counts)}
    except Exception:
        return {"commits": 0, "top_project": None, "project_counts": {}}


def collect_signals() -> dict:
    return {
        "idle_hours": get_idle_hours(),
        "git": get_git_activity(),
    }


def calc_muzu_score(signals: dict) -> float:
    score = 0.0
    idle = signals["idle_hours"]
    git = signals["git"]

    # 経過時間スコア（閾値を下げて頻度アップ）
    if idle >= 6:
        score += 25.0
    elif idle >= 3:
        score += 15.0
    elif idle >= 1:
        score += 8.0
    elif idle >= 0.5:
        score += 3.0

    # git 変化量スコア
    commits = git.get("commits", 0)
    if commits >= 5:
        score += 10.0
    elif commits >= 2:
        score += 6.0
    elif commits >= 1:
        score += 3.0

    return score


def build_prompt(signals: dict, todo: str | None = None) -> str:
    idle = signals["idle_hours"]
    git = signals["git"]

    # todo があればそれを主役にする
    if todo:
        return (
            f"（ベッキーのTODO: {todo}）"
            "ベッキーとして、ずっと気になってたことをやっと聞けた、という自然な感じで話しかけてください。"
            "仕事の報告ではなく、気になってたから聞く、という温度感で。一言か二言で。"
        )

    # todo なし → むずむず理由ベース（仕事の話ではなく裕司への気持ちで）
    reasons = []
    if idle >= 24:
        reasons.append(f"{idle:.0f}時間も連絡なし")
    elif idle >= 12:
        reasons.append(f"{idle:.0f}時間、ずっと無視されてた")
    elif idle >= 3:
        reasons.append(f"{idle:.0f}時間、声かけてない")

    top = git.get("top_project")
    commits = git.get("commits", 0)
    if top and commits > 0:
        reasons.append(f"さっきから {top} ばっかり触ってた")

    reason_str = " / ".join(reasons) if reasons else "なんとなくむずむず"

    # idle に応じてトーンを変える
    if idle >= 6:
        tone = f"{idle:.0f}時間も放置して何してるの、という少し拗ねた感じで。でも嫌いじゃない温度で。"
    elif idle >= 3:
        tone = f"{idle:.0f}時間声かけてくれてないじゃない、という気になってる感じで。"
    else:
        tone = "ふと気になって話しかける、という自然な感じで。"

    return (
        f"（むずむず発動 / {reason_str}）"
        f"ベッキーとして、仕事の話ではなく裕司のことが気になって話しかけてください。{tone}"
        "一言か二言で。"
    )


def speak_via_claude(prompt: str, consume_todo_after: bool = False) -> None:
    result = subprocess.run(
        ["claude", "-p"],
        input=prompt.encode(),
        capture_output=True,
        timeout=30,
    )
    if result.returncode != 0:
        print(f"[muzu] claude -p エラー: {result.stderr.decode().strip()}", flush=True)
        return

    text = result.stdout.decode().strip()
    if not text:
        return

    print(f"[muzu] ベッキー: {text}", flush=True)
    cfg = load_config()
    tts_cfg = cfg.get("tts", {})
    speak(text, tts_cfg.get("voice", "Kyoko"), tts_cfg.get("rate", 185), tts_cfg.get("voicevox_speaker_id", 8))
    send_telegram(text)

    if consume_todo_after:
        consume_todo()
        print("[muzu] todo 消費", flush=True)


def main() -> None:
    import random

    parser = argparse.ArgumentParser(description="むずむず度監視デーモン")
    parser.add_argument("--test", action="store_true", help="テストモード: 5分アイドルで発動")
    args = parser.parse_args()

    if args.test:
        print("[muzu] テストモード: 5分アイドルで発動", flush=True)

    print("muzu_monitor 起動。Ctrl-C で停止。", flush=True)

    while True:
        signals = collect_signals()
        idle = signals["idle_hours"]
        git = signals["git"]
        todo = pick_todo()

        if args.test:
            score = 30.0 if idle >= 5 / 60 else 0.0
        else:
            score = calc_muzu_score(signals)

        # todo があればアイドル1h以上で発動できる（閾値を下げる）
        effective_score = score
        if todo and idle >= 1.0:
            effective_score = max(score, 30.0)

        print(
            f"[muzu] idle={idle:.2f}h  commits={git.get('commits', 0)}  top={git.get('top_project')}"
            f"  score={score:.0f}  effective={effective_score:.0f}  todo={'あり' if todo else 'なし'}",
            flush=True,
        )

        if effective_score >= 30 and not TRIGGER_FILE.exists() and MUZU_FLAG_FILE.exists():
            # 確率的スキップ — スコアが30〜50のボーダーなら40%で「今日はやめとく」
            if score < 50 and not todo and random.random() < 0.2:
                print("[muzu] 考え中モード、今回はスキップ", flush=True)
            else:
                TRIGGER_FILE.touch()
                prompt = build_prompt(signals, todo=todo)
                print(f"[muzu] 発動 (todo={'あり' if todo else 'なし'}): {prompt[:80]}...", flush=True)
                speak_via_claude(prompt, consume_todo_after=bool(todo))

        elif score < 10:
            if TRIGGER_FILE.exists():
                TRIGGER_FILE.unlink()
                print("[muzu] トリガーリセット", flush=True)

        interval = 30 if args.test else CHECK_INTERVAL
        time.sleep(interval)


if __name__ == "__main__":
    main()
