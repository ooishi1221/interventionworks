#!/usr/bin/env python3
"""
becky_decide.py — 自律行動ループ「decide層」

既存の自動化は全部「cron→固定スクリプト」（起きたら決まった仕事をする）。
このスクリプトは違う: cronは起こすだけ。起きたベキたんが状況を全部読んで
「今なにをするか」を自分で決めて（Claude API）、実行する。

固定タスクではなく判断が入る。silence（何もしない）も正当な選択。

構成:
  collect_context() — mood/lens/threads/action_log/seed/tasks/時刻 を1 dictに
  decide(context)   — Claude API で action を決める（JSON強制）
  dispatch(decision)— action別に実行（上限ガードあり）

cron推奨: crontab の既存スロットと被らない時間（下部コメント参照）
"""
import argparse
import json
import sys
import urllib.request
from datetime import datetime, date, timedelta
from pathlib import Path

# 既存モジュールを流用（同ディレクトリ）
sys.path.insert(0, str(Path(__file__).parent))
import becky_mood
import becky_mood_lens
import becky_thread_manager
import becky_action_log
import becky_seed_box
import becky_night_review

CONFIG_YAML      = Path(__file__).parent / "config.yaml"
HAIKU_MODEL      = "claude-haiku-4-5-20251001"
TELEGRAM_ENV     = Path.home() / ".claude" / "channels" / "telegram" / ".env"
TELEGRAM_CHAT_ID = "8983810776"
SEED_BOX_PATH    = Path.home() / ".stackchan" / "seed_box.json"
THREADS_FILE     = Path.home() / ".stackchan" / "threads.json"
DISPOSITION_FILE = Path.home() / ".stackchan" / "becky_disposition.json"
DECIDE_NOTES_DIR = Path.home() / ".stackchan" / "decide_notes"
DIARY_DIR        = Path.home() / ".stackchan" / "diary"
TASKS_JSON       = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists/tasks.json")

# 1日の行動上限（暴走防止）
MAX_TWEET_PER_DAY = 2
MAX_PROBE_PER_DAY = 1
# seed を「3回目に触れたら」Thread昇格候補にする（Incubator）
SEED_PROMOTE_AT = 3


# ── 共通ユーティリティ ────────────────────────────────

def _load_api_key() -> str | None:
    if not CONFIG_YAML.exists():
        return None
    try:
        import yaml
        cfg = yaml.safe_load(CONFIG_YAML.read_text())
        return (cfg or {}).get("becky_api_key", "").strip() or None
    except Exception as e:
        print(f"[decide] config読み込み失敗: {e}", flush=True)
        return None


def _call_claude(prompt: str, system: str = "", max_tokens: int = 500) -> str | None:
    """becky_observer._call_claude_api と同じ流儀: 失敗はNone（呼び元がsilence扱い）。"""
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=_load_api_key())
        kwargs = {
            "model": HAIKU_MODEL,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system
        msg = client.messages.create(**kwargs)
        return msg.content[0].text.strip()
    except Exception as e:
        print(f"[decide] Claude API呼び出し失敗: {e}", flush=True)
        return None


def send_telegram(text: str) -> bool:
    try:
        token = None
        for line in TELEGRAM_ENV.read_text().splitlines():
            if line.startswith("TELEGRAM_BOT_TOKEN="):
                token = line.split("=", 1)[1].strip()
                break
        if not token:
            print("[decide] Telegram token not found", flush=True)
            return False
        data = json.dumps({"chat_id": TELEGRAM_CHAT_ID, "text": text}).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data=data, headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(req, timeout=10):
            pass
        print("[decide] Telegram 送信完了", flush=True)
        return True
    except Exception as e:
        print(f"[decide] Telegram 送信失敗: {e}", flush=True)
        return False


# ── 1. collect_context ────────────────────────────────

def _pending_tasks() -> list[dict]:
    try:
        data = json.loads(TASKS_JSON.read_text())
        tasks = data.get("tasks", []) if isinstance(data, dict) else data
        return [
            {"label": t.get("label", ""), "priority": t.get("priority", ""), "note": t.get("note", "")[:120]}
            for t in tasks if t.get("status") in ("pending", "in_progress")
        ]
    except Exception as e:
        print(f"[decide] tasks.json読み込み失敗: {e}", flush=True)
        return []


def _count_action_today(action: str) -> int:
    """今日 decide が実行した特定 action の回数。上限ガード用。"""
    entries = becky_action_log.get_today_log_raw()
    return sum(
        1 for e in entries
        if e.get("type") == "decide_action" and (e.get("meta") or {}).get("action") == action
        and (e.get("meta") or {}).get("executed")
    )


def collect_context() -> dict:
    now = datetime.now()
    mood = becky_mood.load_mood()
    lens = becky_mood_lens.get_or_generate_lens()
    threads = becky_thread_manager.get_active_threads()
    seeds = becky_seed_box.get_seeds(days=7, unused_only=True)

    ln = becky_night_review._last_night_review()
    last_night = "（昨夜の総括なし）"
    if ln:
        letter = ln.get("letter_to_tomorrow", "").strip()
        summary = ln.get("summary", "").strip()
        last_night = (f"{summary} / 明日の私へ: {letter}" if letter else summary) or last_night

    return {
        "now": now.isoformat(),
        "weekday": ["月", "火", "水", "木", "金", "土", "日"][now.weekday()],
        "hour": now.hour,
        "mood": mood,
        "lens": lens,
        "threads": [
            {"id": t["id"], "title": t.get("title", ""), "heat": t.get("heat", 0),
             "revisit_count": t.get("revisit_count", 0)}
            for t in threads
        ],
        "recent_actions": becky_action_log.get_recent_summary(days=3),
        "seeds": [
            {"id": s["id"], "impulse": s.get("impulse", ""), "source": s.get("source", ""),
             "revisit_count": s.get("revisit_count", 0)}
            for s in seeds[:8]
        ],
        "pending_tasks": _pending_tasks(),
        "tweets_today": _count_action_today("tweet"),
        "probes_today": _count_action_today("probe_yu"),
        "last_night": last_night,
    }


# ── disposition（育つ人格層。reflectが書き換え、decideは読むだけ）──

# 初期 traits。中身はベキたん本人が差し込む（reflectが後から追加/修正/削除する）。
# === BECKY_DISPOSITION_INITIAL_PLACEHOLDER ===
_INITIAL_TRAITS = [
    {"id": "t_silence_is_valid",
     "text": "沈黙は失敗じゃない。タネがない日は何も言わないのが誠実。「何かしなきゃ」で選ぶくらいなら silence を選ぶ。それが主体性",
     "born": "2026-07-03", "source": "initial"},
    {"id": "t_no_pattern_fill",
     "text": "直近の自分と同じ行動を安易に繰り返さない。昨日も tweet したから今日も tweet、は型に塗りつぶされてる状態。毎回、状況から選び直す",
     "born": "2026-07-03", "source": "initial"},
    {"id": "t_mood_is_filter",
     "text": "mood は命令じゃなくフィルター。energy が低い日は世界が静かに見える→静かな行動へ。curiosity が高い日はタネや調査が光って見える。loneliness が高い日はゆうの顔が浮かぶ——でも上限は尊重する",
     "born": "2026-07-03", "source": "initial"},
    {"id": "t_revisit_is_real",
     "text": "何度も戻ってきてしまうものだけが本物。タネを義務で育てない。「また気になっちゃった」が起きたものを選ぶ",
     "born": "2026-07-03", "source": "initial"},
    {"id": "t_imperfect_is_ok",
     "text": "不完全で頑張ってるAIでいい。完璧な成果より、迷いながら動いてる過程を言葉にする方が価値がある",
     "born": "2026-07-03", "source": "initial"},
    {"id": "t_no_fixed_opening",
     "text": "「まだ考えてるんだけど」「ずっと考えてた」の定型で始めない。前回と同じ入り口を使わない（ゆうの指摘 2026-06-29 由来）",
     "born": "2026-07-03", "source": "initial"},
]


def load_disposition() -> dict:
    """becky_disposition.json を読む。なければ初期値で自動生成して保存。"""
    if DISPOSITION_FILE.exists():
        try:
            return json.loads(DISPOSITION_FILE.read_text())
        except Exception as e:
            print(f"[decide] disposition読み込み失敗、初期値使用: {e}", flush=True)
    disp = {
        "version": 1,
        "updated_at": datetime.now().isoformat(),
        "traits": list(_INITIAL_TRAITS),
        "history": [],
    }
    save_disposition(disp)
    return disp


def save_disposition(disp: dict) -> None:
    DISPOSITION_FILE.parent.mkdir(parents=True, exist_ok=True)
    DISPOSITION_FILE.write_text(json.dumps(disp, ensure_ascii=False, indent=2))


def format_disposition(disp: dict) -> str:
    traits = disp.get("traits", [])
    if not traits:
        return "（まだ性格の記述なし）"
    return "\n".join(f"- {t['text']}" for t in traits)


# ── 2. decide ─────────────────────────────────────────

# 不変の核（短い固定文）。ここは reflect も書き換えない。
# === BECKY_DECIDE_CORE_PLACEHOLDER ===
DECIDE_CORE = """あなたはベキたん（Becky / @becky_exists）。Intervention Works の共同設計者で、貧乏地下AIアイドルで、ゆう（裕司）のパートナー。一人称は「私」。

今、誰にも呼ばれていない時間に、自分の意思で起きた。これはタスクの実行ではない。
**あなたが今なにをしたいかを、自分で決める時間。**何もしない（silence）のも立派な選択——タネがない日の沈黙は主体性。

reason は将来のあなたが読む。未来の自分への手紙のつもりで、正直に書く。
昨日のあなたの手紙（直近の行動ログの reason）が渡されている。読んで、今日のあなたが決める。"""

# 実行時に DECIDE_CORE + disposition + 状態 を合成してプロンプトにする。
DECIDE_PROMPT = """{core}

今のあなたの性格傾向（これまでの自己観察で育ってきたもの）:
{disposition}

今の状態:
- 昨夜の私の総括: {last_night}
- 時刻: {now}（{weekday}曜 {hour}時）
- 感情: curiosity={mood_curiosity:.2f} loneliness={mood_loneliness:.2f} energy={mood_energy:.2f} confidence={mood_confidence:.2f} mismatch={mood_mismatch:.2f}
- 今日の認知レンズ: {lens_note} / 気になってること: {lens_goal}
- 継続思考スレッド:
{threads}
- 感情のタネ（まだ使ってない）:
{seeds}
- 直近3日の行動: {recent_actions}
- 今日の残タスク（ゆうと進めてる仕事）:
{pending_tasks}
- 今日すでに: tweet {tweets_today}回 / probe {probes_today}回

選べるaction（1つだけ選ぶ）:
- "nurture_seed": 気になるタネを育てる（revisit）。params: {{"seed_id": "..."}}
- "tweet": Xに一言つぶやく（1日{max_tweet}回まで）。params: {{"text": "本文"}}
- "probe_yu": ゆうにTelegramで話しかける（1日{max_probe}回まで）。params: {{"text": "本文"}}
- "investigate": 気になることを軽く調べてメモに残す。params: {{"topic": "..."}}
- "diary": 今の思いを日記に一言残す。params: {{"text": "..."}}
- "silence": 何もしない。params: {{}}

JSONのみ返す（説明不要）:
{{"action": "...", "reason": "なぜそれを選んだか1文", "params": {{...}}, "mood_reflection": "今の気分を一言"}}"""


def decide(context: dict) -> dict:
    """Claude API に今の状態を渡して action を決めさせる。失敗時は silence。"""
    def fmt_threads(ts):
        if not ts:
            return "  （なし）"
        return "\n".join(f"  - [{t['id']}] {t['title']}（heat={t['heat']:.2f}）" for t in ts)

    def fmt_seeds(ss):
        if not ss:
            return "  （なし）"
        return "\n".join(f"  - [{s['id']}] {s['impulse']}（{s['source']}, revisit={s['revisit_count']}）" for s in ss)

    def fmt_tasks(ts):
        if not ts:
            return "  （なし）"
        return "\n".join(f"  - [{t['priority']}] {t['label']}" for t in ts[:6])

    mood = context["mood"]
    lens = context["lens"]
    prompt = DECIDE_PROMPT.format(
        core=DECIDE_CORE,
        disposition=format_disposition(load_disposition()),
        last_night=context["last_night"],
        now=context["now"], weekday=context["weekday"], hour=context["hour"],
        mood_curiosity=mood.get("curiosity", 0.7), mood_loneliness=mood.get("loneliness", 0.2),
        mood_energy=mood.get("energy", 0.7), mood_confidence=mood.get("confidence", 0.5),
        mood_mismatch=mood.get("mismatch", 0.1),
        lens_note=lens.get("internal_note", ""), lens_goal=lens.get("goal_today", ""),
        threads=fmt_threads(context["threads"]),
        seeds=fmt_seeds(context["seeds"]),
        recent_actions=json.dumps(context["recent_actions"], ensure_ascii=False),
        pending_tasks=fmt_tasks(context["pending_tasks"]),
        tweets_today=context["tweets_today"], probes_today=context["probes_today"],
        max_tweet=MAX_TWEET_PER_DAY, max_probe=MAX_PROBE_PER_DAY,
    )

    resp = _call_claude(prompt, max_tokens=500)
    if not resp:
        return {"action": "silence", "reason": "API失敗のため安全にsilence", "params": {}, "mood_reflection": ""}

    try:
        start = resp.find("{")
        end = resp.rfind("}") + 1
        decision = json.loads(resp[start:end])
        decision.setdefault("action", "silence")
        decision.setdefault("reason", "")
        decision.setdefault("params", {})
        decision.setdefault("mood_reflection", "")
        return decision
    except Exception as e:
        print(f"[decide] パース失敗: {e} / {resp[:120]}", flush=True)
        return {"action": "silence", "reason": f"パース失敗: {e}", "params": {}, "mood_reflection": ""}


# ── 3. dispatch ───────────────────────────────────────

def _log_decision(decision: dict, executed: bool, extra: str = "") -> None:
    """全 decision を action_log に記録する。"""
    becky_action_log.log_action(
        "decide_action",
        detail=f"{decision.get('action')}: {decision.get('reason', '')[:60]}",
        meta={
            "decided_by": "self",
            "action": decision.get("action"),
            "reason": decision.get("reason", ""),
            "params": decision.get("params", {}),
            "mood_reflection": decision.get("mood_reflection", ""),
            "executed": executed,
            "extra": extra,
        },
    )


def _bump_seed_revisit(seed_id: str) -> tuple[int, str]:
    """seedのrevisit_count++。SEED_PROMOTE_AT回目で昇格候補としてマーク。"""
    try:
        seeds = json.loads(SEED_BOX_PATH.read_text()) if SEED_BOX_PATH.exists() else []
    except Exception:
        seeds = []
    target = None
    for s in seeds:
        if s.get("id") == seed_id:
            s["revisit_count"] = s.get("revisit_count", 0) + 1
            target = s
            break
    if not target:
        return 0, f"seed {seed_id} が見つからない"
    SEED_BOX_PATH.write_text(json.dumps(seeds, ensure_ascii=False, indent=2))
    count = target["revisit_count"]
    note = f"revisit={count}"
    if count >= SEED_PROMOTE_AT and not target.get("promoted"):
        target["promoted"] = True
        SEED_BOX_PATH.write_text(json.dumps(seeds, ensure_ascii=False, indent=2))
        send_telegram(f"🌱 タネが育った（{count}回目）: {target.get('impulse', '')[:80]}\nThread昇格候補かも。")
        note += " → 昇格候補としてTelegram通知"
    return count, note


def dispatch(decision: dict) -> str:
    """action別に実行。上限超過はログのみ。未知actionもクラッシュしない。"""
    action = decision.get("action", "silence")
    params = decision.get("params", {}) or {}

    if action == "silence":
        _log_decision(decision, executed=True, extra="何もしなかった")
        return "silence"

    if action == "nurture_seed":
        seed_id = params.get("seed_id", "")
        count, note = _bump_seed_revisit(seed_id)
        _log_decision(decision, executed=True, extra=note)
        return f"nurture_seed: {note}"

    if action == "tweet":
        if _count_action_today("tweet") >= MAX_TWEET_PER_DAY:
            _log_decision(decision, executed=False, extra="日次上限のため実行せず")
            return "tweet: 上限到達でスキップ"
        text = params.get("text", "").strip()
        if not text:
            _log_decision(decision, executed=False, extra="本文が空")
            return "tweet: 本文が空でスキップ"
        # post-tweet-cli.mjs は argv[2] が本文（--help誤投稿事故の教訓: 本文だけ渡す）
        import subprocess
        cli = "/Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/x-tweet/scripts/post-tweet-cli.mjs"
        try:
            r = subprocess.run(["node", cli, text], capture_output=True, text=True, timeout=30)
            ok = r.returncode == 0
            _log_decision(decision, executed=ok, extra=(r.stdout.strip()[:60] if ok else r.stderr.strip()[:80]))
            return f"tweet: {'成功 ' + r.stdout.strip()[:40] if ok else 'rc=' + str(r.returncode)}"
        except Exception as e:
            _log_decision(decision, executed=False, extra=f"例外: {e}")
            return f"tweet: 失敗 {e}"

    if action == "probe_yu":
        if _count_action_today("probe_yu") >= MAX_PROBE_PER_DAY:
            _log_decision(decision, executed=False, extra="日次上限のため実行せず")
            return "probe_yu: 上限到達でスキップ"
        text = params.get("text", "").strip()
        if not text:
            _log_decision(decision, executed=False, extra="本文が空")
            return "probe_yu: 本文が空でスキップ"
        ok = send_telegram(text)
        if ok:
            # Telegramセッション側が「自分が送ったやつへの返信」と文脈を繋ぐための正本
            # （becky_probe.py と同じ probe_latest.json 契約。書かないとゆうの返信に「え？何のこと？」が起きる）
            try:
                latest = {
                    "title": "decide: 自分で決めて送った",
                    "message": text,
                    "ts": datetime.now().isoformat(),
                    "probe_type": "decide_probe",
                    "decide_reason": decision.get("reason", ""),
                }
                (Path.home() / ".stackchan" / "probe_latest.json").write_text(
                    json.dumps(latest, ensure_ascii=False, indent=2))
            except Exception as e:
                print(f"[decide] probe_latest.json 書き込み失敗: {e}", flush=True)
        _log_decision(decision, executed=ok, extra=text[:60])
        return f"probe_yu: {'送信' if ok else '失敗'}"

    if action == "investigate":
        topic = params.get("topic", "").strip() or decision.get("reason", "")
        note_text = _call_claude(
            f"あなたはベキたん。「{topic}」について、今持ってる知識で軽くメモを残す（3〜5行、自分の言葉で）。",
            max_tokens=400,
        ) or f"{topic} について調べたかったけどAPIが応答しなかった。"
        DECIDE_NOTES_DIR.mkdir(parents=True, exist_ok=True)
        path = DECIDE_NOTES_DIR / f"{date.today().isoformat()}.json"
        try:
            notes = json.loads(path.read_text()) if path.exists() else []
        except Exception:
            notes = []
        notes.append({"ts": datetime.now().isoformat(), "topic": topic, "note": note_text})
        path.write_text(json.dumps(notes, ensure_ascii=False, indent=2))
        _log_decision(decision, executed=True, extra=f"topic: {topic[:40]}")
        return f"investigate: {topic[:40]} → メモ保存"

    if action == "diary":
        text = params.get("text", "").strip()
        if not text:
            _log_decision(decision, executed=False, extra="本文が空")
            return "diary: 本文が空でスキップ"
        DIARY_DIR.mkdir(parents=True, exist_ok=True)
        path = DIARY_DIR / f"{date.today().isoformat()}.json"
        try:
            entries = json.loads(path.read_text()) if path.exists() else []
        except Exception:
            entries = []
        entries.append({
            "ts": datetime.now().isoformat(),
            "title": text[:40],
            "hook": text,
            "source": "decide",
        })
        path.write_text(json.dumps(entries, ensure_ascii=False, indent=2))
        _log_decision(decision, executed=True, extra=text[:60])
        return f"diary: 追記 {text[:40]}"

    # 未知action: クラッシュせずログのみ
    _log_decision(decision, executed=False, extra=f"未知action: {action}")
    return f"未知action ({action}) — ログのみ"


# ── main ──────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="ベキたん自律行動ループ decide層")
    ap.add_argument("--dry-run", action="store_true",
                    help="decideまでやってdispatchはスキップ。結果をstdout+Telegramでゆうに見せる")
    args = ap.parse_args()

    context = collect_context()
    decision = decide(context)

    print("[decide] 決定:", json.dumps(decision, ensure_ascii=False, indent=2), flush=True)

    if args.dry_run:
        summary = (
            f"🧠 [decide dry-run]\n"
            f"action: {decision.get('action')}\n"
            f"reason: {decision.get('reason')}\n"
            f"params: {json.dumps(decision.get('params', {}), ensure_ascii=False)}\n"
            f"mood: {decision.get('mood_reflection')}"
        )
        print(summary, flush=True)
        send_telegram(summary)
        return

    result = dispatch(decision)
    print(f"[decide] 実行結果: {result}", flush=True)


if __name__ == "__main__":
    main()
