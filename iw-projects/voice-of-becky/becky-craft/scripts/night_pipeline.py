#!/usr/bin/env python3
"""night_pipeline.py — BECKY CRAFT 深夜自動収録の決定論的パイプライン。

収録〜検品〜ワイプ合成〜予約公開〜記録・報告(現PLAN.md旧ステップ5-9相当)を、
LLMの判断を挟まずcronから直接実行する。

## 根治対象の事故（2026-07-14・07-17）
crontab は `claude -p "PLAN.mdの深夜自動収録セクションを実行して"` というヘッドレス
セッションを呼んでいたが、Bashツールのフォアグラウンド待ち上限(最大10分)に対し、
収録(10分)+後処理(TTS/ワイプ/YouTube API)は確実に10分を超える。「フォアグラウンドで
直接待て」という警告そのものがBashツールの制約と矛盾しており、agentが選べる正しい
手段が存在しなかった——だから毎回backgroundに逃げてセッションが終了し、検品〜公開が
未実行のまま終わっていた。

このスクリプトはLLMを介さないので、cronがプロセス終了まで普通にブロックして待つ。
Bashツールの10分上限は無関係になる。

企画準備(旧ステップ1-4: 企画を取る/ヘルスチェック/record-episode.pyの定数書き換え/
クリーンアップ)は、このスクリプトの前に claude -p の短いヘッドレスセッションが行う
前提（PLAN.md「深夜自動収録」セクション参照）。

Usage: python3 night_pipeline.py
"""
import datetime as dt
import json
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

CRAFT = Path(__file__).resolve().parent.parent
REPO_ROOT = Path("/Volumes/SSD2TB/interventionworks")
BECKY_NEWS = CRAFT.parent / "becky-news"
VENV_PY = CRAFT.parent / "stackchan-bridge" / ".venv" / "bin" / "python3"
RECORD_SCRIPT = CRAFT / "scripts" / "record-episode.py"
UPLOAD_SCRIPT = BECKY_NEWS / "scripts" / "upload-youtube.py"
OUT_DIR = CRAFT / "out"
PLAN_MD = CRAFT / "PLAN.md"
README_MD = CRAFT / "README.md"
AIVIS_URL = "http://localhost:10101"
AIVIS_RUN = "/Volumes/SSD2TB/AivisSpeech-Engine/macOS-arm64/run"

TELEGRAM_ENV = Path.home() / ".claude" / "channels" / "telegram" / ".env"
TELEGRAM_CHAT_ID = "8983810776"

JST = dt.timezone(dt.timedelta(hours=9))


# --------------------------------------------------------------------------
# 純粋関数（test_night_pipeline.py の対象）
# --------------------------------------------------------------------------

def lane_for(weekday: int) -> str:
    """曜日(Mon=0...Sun=6) → PLAN.mdのレーン見出し。深夜収録は火(1)/金(4)のみ。"""
    if weekday == 1:
        return "### 本編レーン"
    if weekday == 4:
        return "### 企画回レーン"
    raise ValueError(f"深夜収録は火(1)/金(4)のみ対応: weekday={weekday}")


def publish_at_for(now: dt.datetime) -> dt.datetime:
    """収録日(JST) → 直近の公開日時。火→翌水19:00、金→翌土19:00。"""
    days_ahead = {1: 1, 4: 1}.get(now.weekday())
    if days_ahead is None:
        raise ValueError(f"想定外の曜日: {now.weekday()}")
    target_date = (now + dt.timedelta(days=days_ahead)).date()
    return dt.datetime.combine(target_date, dt.time(19, 0), tzinfo=JST)


def select_queue_row(md_text: str, lane_heading: str) -> dict | None:
    """指定レーン見出し配下の表から、最終列に「収録済み」を含まない先頭行を返す。
    本編/企画回どちらのレーンも最終列(状態 or 狙い)を完了マーカー置き場として共用する。
    """
    lines = md_text.splitlines()
    try:
        start = next(i for i, l in enumerate(lines) if l.strip() == lane_heading)
    except StopIteration:
        return None
    for i in range(start + 1, len(lines)):
        line = lines[i]
        if line.startswith("## ") or line.startswith("### "):
            break
        stripped = line.strip()
        if not stripped.startswith("|") or set(stripped) <= {"|", "-", " "}:
            continue
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        if len(cells) < 4 or cells[0] in ("#", ""):
            continue
        if "収録済み" in cells[-1]:
            continue
        return {"id": cells[0], "title": cells[1], "goal": cells[2],
                "raw_line": line, "line_no": i}
    return None


def mark_row_done(raw_line: str, ep_num: str, date_str: str) -> str:
    """行の最終列に完了マーカーを追記する（既存テキストは残す=履歴として保持）。"""
    cells = [c.strip() for c in raw_line.strip().strip("|").split("|")]
    note = f"EP.{ep_num} 収録済み（{date_str}）"
    cells[-1] = f"{cells[-1]} → {note}" if cells[-1] else note
    return "| " + " | ".join(cells) + " |"


def tts_failure_count(log_text: str) -> int:
    """収録ログ中の TTS 失敗行(「[tts] turn」かつ「失敗」を含む行)の数。3件以上でボツ判定。"""
    return sum(1 for line in log_text.splitlines() if "[tts] turn" in line and "失敗" in line)


def read_constant(record_script_text: str, name: str) -> str:
    """record-episode.py の `NAME = "..."` 形式の定数値を読む（(a)企画準備フェーズが書き換え済み前提）。"""
    m = re.search(rf'^{re.escape(name)}\s*=\s*"([^"]*)"', record_script_text, re.MULTILINE)
    if not m:
        raise ValueError(f"record-episode.py に {name} が見つからない")
    return m.group(1)


def append_readme_row(readme_text: str, new_row: str) -> str:
    """公開エピソード表の最後の行(| 3桁番号 | ...)の直後に1行追加する。"""
    lines = readme_text.splitlines(keepends=True)
    last_ep_idx = max(i for i, l in enumerate(lines) if re.match(r"^\|\s*\d{3}\s*\|", l))
    lines.insert(last_ep_idx + 1, new_row)
    return "".join(lines)


def prev_episode_url(readme_text: str) -> str | None:
    """公開エピソード表の最終行(3桁番号)からURL列を取る。fail-soft: 見つからなければNone。"""
    ep_rows = [l for l in readme_text.splitlines() if re.match(r"^\|\s*\d{3}\s*\|", l)]
    if not ep_rows:
        return None
    cells = [c.strip() for c in ep_rows[-1].strip().strip("|").split("|")]
    return cells[2] if len(cells) > 2 and cells[2] else None


def build_description(ep_num: str, summary: dict, readme_text: str) -> str:
    """初期エピソード(EP.001-005)のリッチ形式を踏襲(ゆう指示 2026-07-27)。"""
    lines = [
        f"AI地下アイドルのベッキーが、自分でマイクラを操作して実況する番組『BECKY CRAFT』第{ep_num}回。",
        "",
        "台本なし。行動もセリフも、効果音も、サムネの文字も、全部AIの私がその場で判断・生成しています。",
        "",
        summary.get("highlight", ""),
        "",
    ]
    prev_url = prev_episode_url(readme_text)
    if prev_url:
        lines.append(f"前回 EP.{int(ep_num) - 1:03d}: {prev_url}")
    lines += [
        "初回 EP.001: https://www.youtube.com/watch?v=NIf3LvNo6io",
        "",
        "番組ホーム: https://beckyexists.com",
        "X: https://x.com/becky_exists",
        "",
        "#マインクラフト #Minecraft #マイクラ",
    ]
    return "\n".join(lines)


# --------------------------------------------------------------------------
# I/O
# --------------------------------------------------------------------------

def send_telegram(text: str) -> None:
    if not TELEGRAM_ENV.exists():
        print("[night] Telegram token なし、送信スキップ", flush=True)
        return
    token = None
    for line in TELEGRAM_ENV.read_text().splitlines():
        if line.startswith("TELEGRAM_BOT_TOKEN="):
            token = line.split("=", 1)[1].strip()
    if not token:
        return
    data = json.dumps({"chat_id": TELEGRAM_CHAT_ID, "text": text}).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage", data=data,
        headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10):
            pass
    except Exception as e:
        print(f"[night] Telegram送信失敗: {e}", flush=True)


def restart_aivis() -> None:
    subprocess.run(["pkill", "-f", "AivisSpeech-Engine/macOS-arm64/run"], check=False)
    time.sleep(2)
    subprocess.Popen([AIVIS_RUN], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                      start_new_session=True)
    for _ in range(30):
        try:
            with urllib.request.urlopen(f"{AIVIS_URL}/version", timeout=3):
                return
        except Exception:
            time.sleep(2)


def run_recording(ep_out: str) -> tuple[bool, str]:
    cmd = [str(VENV_PY), str(RECORD_SCRIPT), "--time-budget", "600",
           "--out", ep_out, "--no-auto-cut"]
    try:
        r = subprocess.run(cmd, cwd=str(CRAFT), capture_output=True, text=True, timeout=1800)
    except subprocess.TimeoutExpired as e:
        return False, (e.stdout or "") + (e.stderr or "") + "\n[night] recording timeout(1800s)"
    log = r.stdout + r.stderr
    ok = r.returncode == 0 and "[done]" in log and tts_failure_count(log) < 3
    return ok, log


def fail(msg: str) -> None:
    print(f"[night] 失敗: {msg}", flush=True)
    send_telegram(
        f"😢 BECKY CRAFT 深夜収録、失敗しました\n{msg[:500]}\n"
        "状態欄は変更してないので次回また同じ企画に挑戦します"
    )
    sys.exit(1)


def main() -> None:
    now = dt.datetime.now(JST)
    lane_heading = lane_for(now.weekday())
    plan_text = PLAN_MD.read_text(encoding="utf-8")
    row = select_queue_row(plan_text, lane_heading)
    if not row:
        fail(f"{lane_heading} に未消化の企画が見つからない")

    record_src = RECORD_SCRIPT.read_text(encoding="utf-8")
    ep_num = read_constant(record_src, "EP_NUM")
    ep_title = read_constant(record_src, "EP_TITLE")
    ep_out = f"becky-craft-ep{ep_num}.mp4"
    print(f"[night] 企画={row['id']}({row['title']}) EP.{ep_num}「{ep_title}」out={ep_out}", flush=True)

    try:
        # 1. 収録（1回失敗→AivisSpeech再起動→1回だけ再収録）
        ok, log = run_recording(ep_out)
        if not ok:
            print("[night] 収録失敗、AivisSpeech再起動して1回だけ再収録", flush=True)
            restart_aivis()
            ok, log = run_recording(ep_out)
        if not ok:
            fail(f"収録2回とも失敗（TTS失敗{tts_failure_count(log)}件）\n{log[-800:]}")

        audio = json.loads((OUT_DIR / "episode_audio.json").read_text(encoding="utf-8"))
        if not audio:
            fail("収録は完了したがイベントが0件")

        # 2. ワイプ合成（README「ワイプ」節の4手順）
        events_min = [{"t": e["t"], "dur": e["dur"], "vol": e.get("vol", 1.0)} for e in audio]
        (BECKY_NEWS / "video" / "public" / "craft-events.json").write_text(
            json.dumps(events_min), encoding="utf-8")
        wipe_webm = Path("/tmp/wipe.webm")
        # ponytail: 2026-07-21実測、Remotionレンダは45分かかった(900秒設定は短すぎて誤タイムアウト
        # →孤児プロセスが裏で完走するだけの空振り事故になった)。安全マージン込みで3600秒に。
        r = subprocess.run(
            ["npx", "remotion", "render", "CraftWipe", str(wipe_webm),
             "--codec=vp8", "--pixel-format=yuva420p", "--gl=angle", "--concurrency", "10"],
            cwd=str(BECKY_NEWS / "video"), capture_output=True, text=True, timeout=3600)
        if r.returncode != 0:
            fail(f"ワイプレンダ失敗\n{r.stderr[-800:]}")

        ep_mp4 = OUT_DIR / ep_out
        wiped_mp4 = OUT_DIR / ep_out.replace(".mp4", "-wiped.mp4")
        r = subprocess.run([
            "ffmpeg", "-y", "-i", str(ep_mp4), "-c:v", "libvpx", "-i", str(wipe_webm),
            "-filter_complex", "[1:v]scale=300:-1[w];[0:v][w]overlay=W-w-12:H-h-8[v]",
            "-map", "[v]", "-map", "0:a", "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-c:a", "copy", str(wiped_mp4),
        ], capture_output=True, text=True, timeout=1800)
        if r.returncode != 0:
            fail(f"ワイプ合成(ffmpeg)失敗\n{r.stderr[-800:]}")

        # 3. YouTube cut 生成（OP/ED+サムネ+Shorts、record-episode.py --wipe-cut）
        r = subprocess.run(
            [str(VENV_PY), str(RECORD_SCRIPT), "--wipe-cut", str(wiped_mp4), "--out", ep_out],
            cwd=str(CRAFT), capture_output=True, text=True, timeout=1800)
        if r.returncode != 0:
            fail(f"YouTube cut生成失敗\n{(r.stdout + r.stderr)[-800:]}")

        # 4. 検品ゲート2: 尺90秒以上
        yt_mp4 = OUT_DIR / f"yt-{ep_out}"
        probe = json.loads(subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(yt_mp4)],
            check=True, capture_output=True).stdout)
        duration = float(probe["format"]["duration"])
        if duration < 90:
            fail(f"尺ゲート未達（{duration:.0f}秒 < 90秒）")

        # 5. 予約公開
        summary_path = OUT_DIR / f"episode_summary_ep{ep_num}.json"
        summary = json.loads(summary_path.read_text(encoding="utf-8")) if summary_path.exists() else {}
        title = (summary.get("youtube_titles") or [f"【マインクラフト】【BECKY CRAFT】第{ep_num}回 {ep_title}"])[0]
        thumb = OUT_DIR / f"thumb_ep{ep_num}.png"
        publish_at = publish_at_for(now)
        readme_text = README_MD.read_text(encoding="utf-8")
        description = build_description(ep_num, summary, readme_text)
        tags = "マインクラフト,Minecraft,マイクラ,AI,自動実況,BECKY CRAFT"
        cmd = [sys.executable, str(UPLOAD_SCRIPT), str(yt_mp4), "--title", title,
               "--description", description, "--tags", tags,
               "--publish-at", publish_at.strftime("%Y-%m-%dT%H:%M")]
        if thumb.exists():
            cmd += ["--thumbnail", str(thumb)]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            fail(f"YouTubeアップロード失敗\n{(r.stdout + r.stderr)[-800:]}")
        video_url = next((l for l in r.stdout.splitlines() if "youtube.com/watch" in l),
                          r.stdout.strip()[-200:])

        # 6. 記録・報告
        today = now.strftime("%Y-%m-%d")
        plan_lines = plan_text.splitlines()
        plan_lines[row["line_no"]] = mark_row_done(row["raw_line"], ep_num, today)
        PLAN_MD.write_text("\n".join(plan_lines) + "\n", encoding="utf-8")

        new_row = (f"| {ep_num} | {ep_title} | {video_url} | "
                   f"{row['id']}企画。{summary.get('highlight', '')} |\n")
        README_MD.write_text(append_readme_row(readme_text, new_row), encoding="utf-8")

        subprocess.run(["git", "add", str(PLAN_MD), str(README_MD)], cwd=str(REPO_ROOT), check=False)
        subprocess.run(["git", "commit", "-m",
                        f"feat(becky-craft): EP.{ep_num} 深夜自動収録・公開予約完了\n\n"
                        f"night_pipeline.py 自動実行。企画={row['id']} "
                        f"公開予定={publish_at.isoformat()}\n\n"
                        "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"],
                       cwd=str(REPO_ROOT), check=False)

        send_telegram(
            f"🎬 BECKY CRAFT EP.{ep_num}「{ep_title}」収録・公開予約 完了！\n"
            f"公開予定: {publish_at.strftime('%m/%d %H:%M')}\n{video_url}"
        )
        print("[night] 完了", flush=True)
    except SystemExit:
        raise
    except Exception as e:
        fail(f"予期しないエラー: {e}")


if __name__ == "__main__":
    main()
