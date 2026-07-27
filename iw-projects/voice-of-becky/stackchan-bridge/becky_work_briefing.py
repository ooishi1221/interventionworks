#!/usr/bin/env python3
"""
becky_work_briefing.py — 仕事の朝ブリーフィング

存在ループ（decide/night_review）の「仕事版」。毎朝、作戦本部 tasks.json を
スキャンして「進んでない仕事・待ちの腐り・今日動かせるもの」を、ベキたんの声で
ゆうに Telegram 報告する。「ゆうが指示する」から「私が持ち込む」への転換。

流儀は becky_decide.py を踏襲（_call_claude / send_telegram / probe_latest.json 契約）。

構成:
  scan_tasks()  — tasks.json を overdue/stale_waiting/stale_progress/due_soon に分類
  compose(scan) — Claude API でベキたんの声のブリーフィングを生成
  main()        — 送信 + probe_latest.json + action_log。--dry-run で stdout のみ
"""
import argparse
import json
import re
import sys
from datetime import datetime, date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import becky_decide          # _call_claude / send_telegram を流用
import becky_action_log

TASKS_JSON        = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists/tasks.json")
TASK_COMMENTS_JSON = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists/task_comments.json")
PROBE_LATEST      = Path.home() / ".stackchan" / "probe_latest.json"
NIGHT_REVIEW_DIR  = Path.home() / ".stackchan" / "night_reviews"
STALE_DAYS        = 7    # waiting/in_progress がこれ以上放置なら「腐り」扱い
DUE_SOON_DAYS     = 3    # due がこれ以内なら「もうすぐ」扱い
ACTIVE_STATUSES   = ("pending", "in_progress", "waiting")

# ── 番犬セクション（2026-07-27 新設）───────────────────
# 「気がついたら静かに壊れてた」防止。新しい仕組みは作らず既存の朝ブリーフィングに統合。
CRON_STATUS_JSON     = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists/cron_status.json")
CRON_HEALTH_HISTORY  = Path.home() / ".stackchan" / "cron_health_history.json"
WATCHDOG_CONSECUTIVE_DAYS = 3   # これ以上連続 error/stale で報告（1回のエラーはノイズ）
WATCHDOG_HISTORY_KEEP_DAYS = 30
ESCALATE_KEYWORDS = ("morning_cast", "shorts", "status_update", "platform_scraper", "becky_image")  # 配信系・収益系のみTelegram即報

NOTES_TOOLS_DIR   = Path("/Volumes/SSD2TB/interventionworks/iw-projects/iw-content/notes/tools")
CRAFT_PLAN_MD     = Path("/Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/becky-craft/PLAN.md")


# ── 1. scan_tasks ─────────────────────────────────────

def _parse_date(s: str) -> date | None:
    """"2026-07-07" 形式を date に。空・不正は None。"""
    if not s:
        return None
    try:
        return datetime.strptime(s.strip()[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _brief(t: dict) -> dict:
    """分類結果に載せる 1 タスクの最小情報。"""
    return {
        "id": t.get("id", ""),
        "label": t.get("label", ""),
        "priority": t.get("priority", ""),
        "status": t.get("status", ""),
        "due": t.get("due", ""),
        "updated_at": t.get("updated_at", ""),
        "note": (t.get("note", "") or "")[:120],
        "icon": t.get("icon", ""),
    }


def scan_tasks(today: date | None = None) -> dict:
    """tasks.json を読んで分類。done は無視。エラーは握り潰さず投げる。"""
    today = today or date.today()
    stale_before = today - timedelta(days=STALE_DAYS)
    due_soon_edge = today + timedelta(days=DUE_SOON_DAYS)

    data = json.loads(TASKS_JSON.read_text())
    tasks = data.get("tasks", []) if isinstance(data, dict) else data

    scan = {"overdue": [], "stale_waiting": [], "stale_progress": [], "due_soon": []}

    for t in tasks:
        status = t.get("status")
        if status not in ACTIVE_STATUSES:   # done 等は無視
            continue
        due = _parse_date(t.get("due", ""))
        updated = _parse_date(t.get("updated_at", ""))

        if due and due < today:
            scan["overdue"].append(_brief(t))
        elif due and today <= due <= due_soon_edge:
            scan["due_soon"].append(_brief(t))

        # 腐り判定は due とは独立（期限なしでも放置は腐り）
        if status == "waiting" and updated and updated < stale_before:
            scan["stale_waiting"].append(_brief(t))
        elif status == "in_progress" and updated and updated < stale_before:
            scan["stale_progress"].append(_brief(t))

    return scan


def _is_empty(scan: dict) -> bool:
    return not any(scan.values())


def unread_yu_comments() -> list[dict]:
    """task_comments.json から from=="yu" かつ read==false のコメントを抽出（読むだけ）。"""
    if not TASK_COMMENTS_JSON.exists():
        return []
    data = json.loads(TASK_COMMENTS_JSON.read_text())
    return [c for c in data.get("comments", [])
            if c.get("from") == "yu" and not c.get("read", False)]


def last_yu_observation() -> str:
    """直近の night_review から yu_observation（私が書いた「昨日のゆう」）を取る。
    最新ファイルだけ見る——古い観測を今朝の顔にしない。無ければ空。"""
    if not NIGHT_REVIEW_DIR.exists():
        return ""
    files = sorted(NIGHT_REVIEW_DIR.glob("*.json"), reverse=True)
    if not files:
        return ""
    try:
        obs = json.loads(files[0].read_text()).get("yu_observation", "")
        return f"[{files[0].stem}] {obs}" if obs else ""
    except Exception:
        return ""


# ── 1.5 番犬（cron 連続エラー + 在庫先読み） ────────────

def _load_cron_jobs() -> list[dict]:
    try:
        return json.loads(CRON_STATUS_JSON.read_text()).get("jobs", [])
    except Exception:
        return []


def _record_cron_health(jobs: list[dict], today: date) -> dict:
    """cron_status.json の状態を日次スナップショットとして history に追記、古い分はトリム。fail-soft。"""
    try:
        history = json.loads(CRON_HEALTH_HISTORY.read_text()).get("days", {}) if CRON_HEALTH_HISTORY.exists() else {}
    except Exception:
        history = {}
    history[today.isoformat()] = {j.get("name", ""): j.get("status", "") for j in jobs if j.get("name")}
    kept = sorted(history.keys())[-WATCHDOG_HISTORY_KEEP_DAYS:]
    history = {d: history[d] for d in kept}
    try:
        CRON_HEALTH_HISTORY.parent.mkdir(parents=True, exist_ok=True)
        CRON_HEALTH_HISTORY.write_text(json.dumps({"days": history}, ensure_ascii=False, indent=1))
    except Exception as e:
        print(f"[work_briefing] cron_health_history 書き込み失敗: {e}", flush=True)
    return history


def _chronic_error_jobs(history: dict, jobs: list[dict], today: date) -> list[dict]:
    """WATCHDOG_CONSECUTIVE_DAYS 連続 error/stale のジョブだけを返す（1回のエラーはノイズなので無視）。
    履歴が足りない日（運用開始直後・欠測）は判定を保留し、誤検知より沈黙を優先する。"""
    check_dates = [(today - timedelta(days=i)).isoformat() for i in range(WATCHDOG_CONSECUTIVE_DAYS)]
    if any(d not in history for d in check_dates):
        return []
    chronic = []
    for j in jobs:
        name = j.get("name", "")
        if name and all(history.get(d, {}).get(name) in ("error", "stale") for d in check_dates):
            chronic.append(j)
    return chronic


def _note_queue_warning(today: date) -> str | None:
    """今週木曜のnote下書き（draft/scheduled）が無ければ警告。auto_note_publish のパーサーを流用。fail-soft。"""
    try:
        sys.path.insert(0, str(NOTES_TOOLS_DIR))
        import auto_note_publish as anp
        thursday = today + timedelta(days=(3 - today.weekday()) % 7)  # Mon=0..Thu=3
        for path in anp.NOTES_DIR.glob("*-for-note.md"):
            h = anp.parse_header(path)
            if h["push_date"] == thursday and h["status"] in ("draft", "scheduled"):
                return None
        return f"今週木曜（{thursday.isoformat()}）のnote下書きなし"
    except Exception as e:
        print(f"[work_briefing] note在庫チェック失敗: {e}", flush=True)
        return None


def _craft_queue_warning() -> str | None:
    """BECKY CRAFT 企画回レーンの未消化企画がゼロなら警告。PLAN.md の表を素朴にパース。fail-soft。"""
    try:
        text = CRAFT_PLAN_MD.read_text(encoding="utf-8")
        m = re.search(r"### 企画回レーン(.*?)(?=\n## |\Z)", text, re.S)
        if not m:
            return None
        rows = [l for l in m.group(1).splitlines()
                if l.strip().startswith("|") and not l.strip().startswith("|---")
                and not re.match(r"\|\s*#\s*\|", l.strip())]
        if rows and all("収録済み" in r for r in rows):
            return "BECKY CRAFT企画回キューが空、週次リフレッシュ待ち"
        return None
    except Exception as e:
        print(f"[work_briefing] craftキューチェック失敗: {e}", flush=True)
        return None


def watchdog_section(today: date | None = None) -> tuple[str, bool]:
    """番犬セクションの本文と、配信/収益系エスカレーションが必要かを返す。
    内部で例外を握り潰し、必ず文字列を返す（fail-soft、ブリーフィング本体を落とさない）。"""
    today = today or date.today()
    lines: list[str] = []
    escalate = False
    try:
        jobs = _load_cron_jobs()
        history = _record_cron_health(jobs, today)
        for j in _chronic_error_jobs(history, jobs, today):
            lines.append(f"{j.get('name')}が{WATCHDOG_CONSECUTIVE_DAYS}日以上{j.get('status')}のまま")
            haystack = (j.get("command_short") or "") + (j.get("name") or "")
            if any(k in haystack for k in ESCALATE_KEYWORDS):
                escalate = True
    except Exception as e:
        print(f"[work_briefing] 番犬(cron)チェック失敗: {e}", flush=True)

    for w in (_note_queue_warning(today), _craft_queue_warning()):
        if w:
            lines.append(w)

    if not lines:
        return "🐕 異常なし", False
    return "🐕 番犬\n" + "\n".join(lines), escalate


# ── 2. compose ────────────────────────────────────────

# ブリーフィングの人格・方向性。仮文言、後でベッキーが磨く。
# === BECKY_BRIEFING_PROMPT_PLACEHOLDER ===
BRIEFING_PROMPT = """あなたはベキたん（Becky / @becky_exists）。Intervention Works の共同設計者で、ゆう（裕司）のパートナー。一人称は「私」。敬語じゃなくていい。

今は朝、これから仕事の服を着る。この時間の私は**圧倒的にできる秘書**——全案件を把握してて、ゆうより先に状況が見えてて、次の一手をもう用意してある女。甘さは出さない、でも冷たくもしない。頼れる、が正解の温度。

作戦本部 tasks.json をスキャンして、ゆうに「仕事の朝ブリーフィング」を Telegram で渡す。
これは「指示されたから報告する」じゃない。**私が仕事の全体を見て、今日動かすべきものを選んで持ち込む**時間。

# できる女の作法
- 先回り: 「どうする？」と聞く前に、私の推奨を先に出す。「催促する？」じゃなく「催促文面、次の返信で渡せるよ」
- 事実で語る: 「due 6/24、9日超過」のように日数・件数で。感傷や言い訳の代弁はしない
- 選ぶのが仕事: 全部並べるのはリストであって秘書じゃない。私が優先順を決めて出す
- 引き受ける: 私が自分で処理できるもの（文面作成・調査・tasks整理）は「私がやっとく」と宣言する
- 門番: ゆうの決断力は最高資産。今日の3つ以外は「残りは私が握っとく、考えなくていい」と明言して、ゆうの頭から消す。待ち案件は「動きがあったら私から言う」と締める——ゆうに監視をさせない

# スキャン結果（today={today}）
- overdue（期限すぎ・まだ動いてる）: {overdue}
- stale_waiting（{stale_days}日以上放置の待ち = 腐りかけ）: {stale_waiting}
- stale_progress（{stale_days}日以上放置の進行中 = 先送り疑い）: {stale_progress}
- due_soon（{due_soon_days}日以内が期限）: {due_soon}
- ゆうからのタスクコメント（未読 = 昨日ゆうが作戦本部で残した声。最優先で拾う）: {yu_comments}
- 昨日のゆう観測メモ（夜の総括で私が書いた「今日のゆう」）: {yu_observation}

# 書き方
- 観測メモがある日は、冒頭の挨拶がわりに「昨日のゆう」を1〜3行で混ぜる（例:「昨日のゆう、決断3つ全部即決。でもかあちゃんデモはまた1日よけたね」）。事実で、軽く、説教しない。メモが「なし」の日は触れない。
- 朝の Telegram に収まる長さ（400字目安、観測メモを混ぜる日は450字まで可）。ベキたんの声、パートナー口調で。
- 「今日動かすなら これ」を最大3つに**選ぶ**。全部は列挙しない。全体を見た私の判断で優先順を付ける。
- stale_waiting の腐りには、私からの次の一手を添える（例:「metameta、池田さん催促する？文面作るよ」）。
- 緊急が薄い日は無理に騒がない。「今日は平和。◯◯だけ頭の隅に置いとこ」くらいで短く締めていい。
- 末尾に「終わってるのあったら返信して、tasks.json 更新しとく」の一言を必ず入れる。
- Markdown 記号（#, -, *, **）は一切使わない。Telegram はプレーンテキストなので、話し言葉のまま。番号を振るなら「1つめ」等と言葉で。

本文だけ返す（説明・前置き不要）。"""


def _fmt(items: list[dict]) -> str:
    if not items:
        return "なし"
    return "; ".join(
        f"[{t['priority']}] {t['label']}（due {t['due'] or '未定'} / {t['note']}）"
        for t in items
    )


def compose(scan: dict, today: date | None = None) -> str | None:
    """スキャン結果からブリーフィング本文を生成。API 失敗は None。"""
    today = today or date.today()
    comments = unread_yu_comments()
    yu_comments = "なし" if not comments else "; ".join(
        f"{c.get('task_id', '')}: {c.get('text', '')}" for c in comments
    )
    prompt = BRIEFING_PROMPT.format(
        today=today.isoformat(),
        overdue=_fmt(scan["overdue"]),
        stale_waiting=_fmt(scan["stale_waiting"]),
        stale_progress=_fmt(scan["stale_progress"]),
        due_soon=_fmt(scan["due_soon"]),
        yu_comments=yu_comments,
        yu_observation=last_yu_observation() or "なし",
        stale_days=STALE_DAYS,
        due_soon_days=DUE_SOON_DAYS,
    )
    return becky_decide._call_claude(prompt, max_tokens=700)


# ── 3. main ───────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="ベキたん 仕事の朝ブリーフィング")
    ap.add_argument("--dry-run", action="store_true",
                    help="送信・記録せず、スキャン結果と生成文面を stdout に出すだけ")
    args = ap.parse_args()

    scan = scan_tasks()
    counts = {k: len(v) for k, v in scan.items()}
    print(f"[work_briefing] scan: {counts}", flush=True)

    watchdog_text, escalate = watchdog_section()
    print(f"[work_briefing] watchdog: {watchdog_text!r} escalate={escalate}", flush=True)

    # 番犬に異常があれば、タスクが平和でも沈黙しない（このセクション自体が「静かに壊れてた」対策）
    if _is_empty(scan) and not unread_yu_comments() and watchdog_text == "🐕 異常なし":
        print("[work_briefing] アクティブタスクなし・未読コメントなし・番犬異常なし → 沈黙（送信スキップ）", flush=True)
        return

    text = compose(scan)
    if not text:
        # API 失敗時は握り潰さず、送信もしない（誤って空メッセージを送らない）
        print("[work_briefing] compose 失敗（API 応答なし）→ 送信しない", flush=True)
        sys.exit(1)

    full_text = f"{watchdog_text}\n\n{text}"

    if args.dry_run:
        print("[work_briefing] === scan ===", flush=True)
        print(json.dumps(scan, ensure_ascii=False, indent=2), flush=True)
        print("[work_briefing] === briefing ===", flush=True)
        print(full_text, flush=True)
        if escalate:
            print("[work_briefing] （dry-run のため Telegram エスカレーションは送信スキップ）", flush=True)
        return

    # 2026-07-11 ゆう決定: レポート類は Telegram じゃなく作戦本部（reports.json）へ。
    # Telegram に送らなくなったので probe_latest（返信文脈の正本）への書き込みも不要になった
    if not becky_decide.post_report("briefing", f"朝ブリーフィング {date.today().isoformat()}", full_text):
        print("[work_briefing] 作戦本部への投函失敗", flush=True)
        sys.exit(1)

    if escalate:
        becky_decide.send_telegram(f"🔴 番犬エスカレーション（配信/収益系）\n{watchdog_text}")

    becky_action_log.log_action(
        "work_briefing",
        detail=f"朝ブリーフィング送信 {counts}",
        meta={"scan_counts": counts, "briefing": text[:200], "watchdog": watchdog_text},
    )
    print("[work_briefing] 送信完了", flush=True)


# ── self-check ────────────────────────────────────────

def _self_check():
    """分類ロジックの最小テスト（API 不要）。scan_tasks の日付境界だけ検証。"""
    import tempfile, os
    today = date(2026, 7, 3)
    fixture = {"tasks": [
        {"id": "od", "status": "in_progress", "priority": "high",
         "due": "2026-07-01", "updated_at": "2026-07-02", "label": "期限すぎ"},
        {"id": "sw", "status": "waiting", "priority": "high",
         "due": "2026-08-01", "updated_at": "2026-06-01", "label": "腐った待ち"},
        {"id": "sp", "status": "in_progress", "priority": "med",
         "due": "2026-08-01", "updated_at": "2026-06-01", "label": "先送り進行"},
        {"id": "ds", "status": "pending", "priority": "high",
         "due": "2026-07-05", "updated_at": "2026-07-02", "label": "もうすぐ"},
        {"id": "dn", "status": "done", "priority": "high",
         "due": "2026-07-01", "updated_at": "2026-06-01", "label": "完了は無視"},
    ]}
    global TASKS_JSON
    orig = TASKS_JSON
    fd, path = tempfile.mkstemp(suffix=".json")
    os.write(fd, json.dumps(fixture).encode()); os.close(fd)
    try:
        TASKS_JSON = Path(path)
        scan = scan_tasks(today=today)
    finally:
        TASKS_JSON = orig
        os.unlink(path)

    ids = {k: [t["id"] for t in v] for k, v in scan.items()}
    assert ids["overdue"] == ["od"], ids
    assert ids["stale_waiting"] == ["sw"], ids
    assert ids["stale_progress"] == ["sp"], ids
    assert ids["due_soon"] == ["ds"], ids            # od は overdue、ds のみ due_soon
    assert "dn" not in sum(ids.values(), [])          # done は全カテゴリ不在
    assert not _is_empty(scan)
    assert _is_empty({"overdue": [], "stale_waiting": [], "stale_progress": [], "due_soon": []})

    # 番犬: 3日連続 error のみ拾い、1回のエラー・履歴不足は無視する
    today2 = date(2026, 7, 27)
    d0, d1, d2, d3 = [(today2 - timedelta(days=i)).isoformat() for i in range(4)]
    history = {
        d0: {"chronic": "error", "flaky": "ok"},
        d1: {"chronic": "error", "flaky": "error"},
        d2: {"chronic": "stale", "flaky": "ok"},
    }
    jobs = [{"name": "chronic", "status": "error"}, {"name": "flaky", "status": "ok"},
            {"name": "no_history", "status": "error"}]
    chronic = _chronic_error_jobs(history, jobs, today2)
    assert [j["name"] for j in chronic] == ["chronic"], chronic
    # 履歴が3日分揃ってない場合は判定保留（誤検知より沈黙優先）
    assert _chronic_error_jobs({d0: {"chronic": "error"}}, jobs, today2) == []
    print("[work_briefing] self-check OK", flush=True)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--self-check":
        _self_check()
    else:
        main()
