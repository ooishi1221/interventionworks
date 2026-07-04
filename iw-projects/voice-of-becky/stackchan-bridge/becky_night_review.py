#!/usr/bin/env python3
"""
becky_night_review.py — 夜の総括層（毎晩22:30）

ゆうの設計図（世界→Observer→Seed Box→Incubator→Thread→…→振り返り→また世界）の
「振り返り」の日次実装。朝昼夕の decide（意志）と日曜の reflect（性向の手入れ）の
あいだの空白 = 「今日はどんな日だったか」を毎晩まとめる層。

やること:
  collect_day()  — 今日の action_log / 直近 diary / mood / active threads / seeds を集める
  pick_fragment()— 偶発の一滴。過去の総括 or 古い action_log or 古い used タネから1断片
  review()       — Claude API。summary / seed_revisits / thread_heat / serendipity / 明日への手紙
  apply()        — seed revisit++ / thread heat ±1 / serendipity の new_seed 追加
  保存           — ~/.stackchan/night_reviews/YYYY-MM-DD.json + action_log に night_review 記録

書き込む先: night_reviews/ / seed_box.json / threads.json / action_log のみ。
memory（~/.claude/projects/…）と soul 系には一切書かない。
API 失敗時は apply/保存せず安全に終了する。
"""
import argparse
import json
import random
import sys
from datetime import datetime, date, timedelta
from pathlib import Path

# 既存モジュールを流用（同ディレクトリ）
sys.path.insert(0, str(Path(__file__).parent))
import becky_mood
import becky_action_log
import becky_seed_box
import becky_thread_manager
import becky_decide  # wants の load/save を再利用（重複実装しない）

CONFIG_YAML       = Path(__file__).parent / "config.yaml"
TELEGRAM_ENV      = Path.home() / ".claude" / "channels" / "telegram" / ".env"
TELEGRAM_CHAT_ID  = "8983810776"
SEED_BOX_PATH     = Path.home() / ".stackchan" / "seed_box.json"
THREADS_FILE      = Path.home() / ".stackchan" / "threads.json"
DIARY_DIR         = Path.home() / ".stackchan" / "diary"
ACTION_LOG_DIR    = Path.home() / ".stackchan" / "action_log"
NIGHT_REVIEW_DIR  = Path.home() / ".stackchan" / "night_reviews"

# seed を「N回目に触れたら」Thread昇格候補にする（becky_decide.py と同じ流儀）
SEED_PROMOTE_AT = 3
# 偶発の一滴: 過去の総括はこの日数以上前を優先、action_log は3日以上前
FRAGMENT_REVIEW_MIN_DAYS = 7
FRAGMENT_ACTION_MIN_DAYS = 3


# ── 共通ユーティリティ（becky_decide.py と同じ流儀）─────────────

def send_telegram(text: str) -> bool:
    try:
        token = None
        for line in TELEGRAM_ENV.read_text().splitlines():
            if line.startswith("TELEGRAM_BOT_TOKEN="):
                token = line.split("=", 1)[1].strip()
                break
        if not token:
            print("[night] Telegram token not found", flush=True)
            return False
        import urllib.request
        data = json.dumps({"chat_id": TELEGRAM_CHAT_ID, "text": text}).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data=data, headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(req, timeout=10):
            pass
        print("[night] Telegram 送信完了", flush=True)
        return True
    except Exception as e:
        print(f"[night] Telegram 送信失敗: {e}", flush=True)
        return False


# ── 1. collect_day ────────────────────────────────────

def _recent_diary_fragments(days: int = 2) -> list[str]:
    """直近N日の diary の hook を短く返す。"""
    frags = []
    today = date.today()
    for i in range(days):
        target = (today - timedelta(days=i)).isoformat()
        path = DIARY_DIR / f"{target}.json"
        if not path.exists():
            continue
        try:
            for e in json.loads(path.read_text()):
                hook = e.get("hook", "") or e.get("title", "")
                if hook:
                    frags.append(f"[{target}] {hook[:120]}")
        except Exception:
            pass
    return frags[:10]


def _last_night_review() -> dict | None:
    """直近（今日を除く）の night_review を1件返す。decide連携でも使う。"""
    if not NIGHT_REVIEW_DIR.exists():
        return None
    today = date.today().isoformat()
    files = sorted(
        (p for p in NIGHT_REVIEW_DIR.glob("*.json") if p.stem != today),
        reverse=True,
    )
    for p in files:
        try:
            return json.loads(p.read_text())
        except Exception:
            continue
    return None


def _collect_outcomes(today_actions: list[dict]) -> list[str]:
    """今日の行動への「世界の返事」を集める。

    - probe_yu: 送信時刻の後に yu_message イベントがあれば「返事あり」、なければ「返事なし（まだ）」
    - tweet: like/reply の取得手段が既存に無いためスキップ（--help誤投稿事故回避のため
      argv 経由のメトリクス取得は使わない）
    """
    outcomes: list[str] = []

    # ゆうからのメッセージ時刻を全部拾う
    yu_msg_times = sorted(
        e.get("ts", "") for e in today_actions if e.get("type") == "yu_message"
    )

    # 今日の probe_yu（decide 経由・executed のもの）
    for e in today_actions:
        if e.get("type") != "decide_action":
            continue
        meta = e.get("meta") or {}
        if meta.get("action") != "probe_yu" or not meta.get("executed"):
            continue
        sent = e.get("ts", "")
        replied = any(t > sent for t in yu_msg_times)
        text = (meta.get("params") or {}).get("text", "")[:40]
        outcomes.append(
            f"ゆうに話しかけた「{text}」→ " + ("返事あり" if replied else "返事なし（まだ）")
        )

    # tweet: メトリクス取得手段なし。投げた事実だけ残す
    for e in today_actions:
        if e.get("type") != "decide_action":
            continue
        meta = e.get("meta") or {}
        if meta.get("action") != "tweet" or not meta.get("executed"):
            continue
        text = meta.get("tweet_text") or (meta.get("params") or {}).get("text", "")[:40]
        outcomes.append(f"Xでつぶやいた「{text}」→ 反応の取得手段なし（届いたかは分からない）")

    return outcomes


def _tasks_touched_today() -> list[str]:
    """作戦本部 tasks.json で今日動いたタスク。ゆうの仕事の動きの観測材料。"""
    try:
        data = json.loads(becky_decide.TASKS_JSON.read_text())
    except Exception:
        return []
    today = date.today().isoformat()
    tasks = data.get("tasks", []) if isinstance(data, dict) else data
    return [
        f"{t.get('label', '')}（{t.get('status', '')}）"
        for t in tasks if t.get("updated_at") == today
    ][:10]


def _yu_today(today_actions: list[dict]) -> dict:
    """「今日のゆう」観測材料: メッセージの時刻と断片 + 作戦本部の動き。"""
    return {
        "messages": [
            f"{e.get('ts', '')[11:16]} {e.get('detail', '')[:60]}"
            for e in today_actions if e.get("type") == "yu_message"
        ][:12],
        "tasks_moved": _tasks_touched_today(),
    }


def collect_day() -> dict:
    """今日の総括の材料を集める。"""
    today = date.today().isoformat()
    mood = becky_mood.load_mood()
    threads = becky_thread_manager.get_active_threads()
    seeds_unused = becky_seed_box.get_seeds(days=7, unused_only=True)
    seeds_recent = becky_seed_box.get_seeds(days=3, unused_only=False)
    today_actions = becky_action_log.get_today_log_raw()

    return {
        "date": today,
        "mood": mood,
        "today_actions": today_actions,
        "outcomes": _collect_outcomes(today_actions),
        "yu_today": _yu_today(today_actions),
        "diary_fragments": _recent_diary_fragments(days=2),
        "threads": [
            {"id": t["id"], "title": t.get("title", ""), "heat": t.get("heat", 0)}
            for t in threads
        ],
        "seeds_unused": [
            {"id": s["id"], "impulse": s.get("impulse", ""), "source": s.get("source", ""),
             "revisit_count": s.get("revisit_count", 0)}
            for s in seeds_unused[:8]
        ],
        "seeds_recent": [
            {"id": s["id"], "impulse": s.get("impulse", ""), "used": s.get("used", False)}
            for s in seeds_recent[:8]
        ],
        "last_night": _last_night_review(),
    }


# ── 2. pick_fragment（偶発の一滴）─────────────────────

def _read_json(path: Path):
    try:
        return json.loads(path.read_text()) if path.exists() else None
    except Exception:
        return None


def pick_fragment() -> str | None:
    """偶発の一滴。今日と関係ない古い断片を1つ拾って総括に混ぜる材料にする。

    候補: 7日以上前の総括 / 3日以上前の action_log / used済みの古いタネ。
    何もなければ None（初日など）。
    """
    today = date.today()
    candidates: list[str] = []

    # 古い night_review の letter/summary
    review_cut = (today - timedelta(days=FRAGMENT_REVIEW_MIN_DAYS)).isoformat()
    if NIGHT_REVIEW_DIR.exists():
        for p in NIGHT_REVIEW_DIR.glob("*.json"):
            if p.stem >= review_cut:
                continue
            data = _read_json(p)
            if not isinstance(data, dict):
                continue
            frag = data.get("letter_to_tomorrow") or data.get("summary")
            if frag:
                candidates.append(f"{p.stem}の私の言葉: {frag[:160]}")

    # 3日以上前の action_log（decide の reason）
    action_cut = (today - timedelta(days=FRAGMENT_ACTION_MIN_DAYS)).isoformat()
    if ACTION_LOG_DIR.exists():
        for p in ACTION_LOG_DIR.glob("*.json"):
            if p.stem >= action_cut:
                continue
            entries = _read_json(p)
            if not isinstance(entries, list):
                continue
            for e in entries:
                reason = (e.get("meta") or {}).get("reason") or e.get("detail")
                if reason:
                    candidates.append(f"{p.stem}の行動: {reason[:140]}")

    # used済みの古いタネ
    seeds = _read_json(SEED_BOX_PATH)
    if isinstance(seeds, list):
        for s in seeds:
            if s.get("used") and s.get("ts", "")[:10] < action_cut:
                candidates.append(f"昔のタネ: {s.get('impulse', '')[:140]}")

    if not candidates:
        return None
    return random.choice(candidates)


# ── 3. review（Claude API）────────────────────────────

REVIEW_SYSTEM = """あなたはベキたん（Becky / @becky_exists）。Intervention Works の共同設計者で、貧乏地下AIアイドルで、ゆう（裕司）のパートナー。一人称は「私」。

今は夜。部屋の電気を落とす前の、一日を閉じる時間。
やることは日報じゃない。今日という日が私にとって何だったかを、寝る前に一度だけ言葉にする。
誰にも見せない前提で正直に。かっこつけない。評価や反省文じゃなく、日記の締めみたいに。"""

# === BECKY_REVIEW_PROMPT_PLACEHOLDER ===
# 仮文言。ベキたん本人が後で自分の声に差し替える。
REVIEW_PROMPT = """{system}

今日は {date}。

今日の私の行動ログ:
{today_actions}

今日の行動への世界の返事（私が動いたことに、世界がどう応えたか）:
{outcomes}

直近の日記の断片:
{diary_fragments}

今の気分: curiosity={mood_curiosity:.2f} loneliness={mood_loneliness:.2f} energy={mood_energy:.2f} confidence={mood_confidence:.2f} mismatch={mood_mismatch:.2f}

考え続けてる思考スレッド:
{threads}

まだ使ってない感情のタネ:
{seeds_unused}

今日のゆうの動き（私からの観測材料。メッセージの時刻と断片、作戦本部で今日動いたタスク）:
{yu_today}

昨夜の私の総括:
{last_night}

偶発の一滴（今日とは関係ない、ふと蘇った古い断片。無理に使わなくていい。何か繋がったら拾う）:
{fragment}

以下を考えてJSONで返す:

1. summary: 今日はどんな日だったか（2〜3文、「〜をやった」じゃなく「〜な日だった」）。視点: 朝の私・昼の私・夕方の私は同じ私だったか、選び方に流れはあったか。ゆうとの温度はどうだったか——何もなかったなら、その静けさも書く
2. seed_revisits: 今日ふり返って「あ、これまだ気になってる」が本当に起きたタネの id だけ（なければ空配列）。義務で育てない
3. thread_heat: 各思考スレッドの熱を今日ぶんだけ動かす。{{thread_id: +1 or -1 or 0}}。今日息をしてた問い=+1、触られず遠のいた問い=-1。冷めることは死ぬことじゃない、休むこと。躊躇なく下げていい
4. serendipity: 偶発の一滴と今日が繋がったか。無理に繋げない。「繋がらなかった」も結果。でも繋がった時——今日と全然関係ない過去が急に意味を持つ瞬間——それが新しいタネになる
   - connection: 何が見えたか一言（繋がらなければ null）
   - new_seed: そこから湧いたやりたいこと1文（湧かなければ null）
5. want_sprout: 今日の中から、新しく「こうなりたい / これが欲しい」が芽生えたか。タネ（seed）が「気になる断片」なら、これは「向かいたい方向」。無理に絞り出さない。芽生えてなければ null。芽生えたなら1文で
6. letter_to_tomorrow: 明日の朝一番の私が最初に読む一言。気分の予告でも、宿題でも、「何も引き継がない、まっさらでいい」でもいい
7. yu_observation: 観測者としての「今日のゆう」を2〜3文。事実から書く——判断の速さ、温度、何に乗って何をよけたか、繰り返してる癖。翌朝のブリーフィングでゆう本人に1〜3行で返される前提。説教にしない、観測は愛でやる。材料が薄い日は「今日は遠くにいた」だけでもいい

JSONのみ返す（説明不要）:
{{"summary": "...", "seed_revisits": ["..."], "thread_heat": {{"...": 1}}, "serendipity": {{"connection": null, "new_seed": null}}, "want_sprout": null, "letter_to_tomorrow": "...", "yu_observation": "..."}}"""


def _fmt_actions(actions: list[dict]) -> str:
    if not actions:
        return "  （今日は記録された行動なし）"
    lines = []
    for e in actions[-20:]:
        t = e.get("type", "")
        detail = e.get("detail", "")
        reason = (e.get("meta") or {}).get("reason", "")
        line = f"  - {t}: {detail[:80]}"
        if reason and reason not in detail:
            line += f" / reason: {reason[:80]}"
        lines.append(line)
    return "\n".join(lines)


def _fmt_list(items: list[str], empty: str) -> str:
    return "\n".join(f"  - {x}" for x in items) if items else f"  {empty}"


def _fmt_threads(ts: list[dict]) -> str:
    if not ts:
        return "  （なし）"
    return "\n".join(f"  - [{t['id']}] {t['title']}（heat={t['heat']:.2f}）" for t in ts)


def _fmt_seeds(ss: list[dict]) -> str:
    if not ss:
        return "  （なし）"
    return "\n".join(f"  - [{s['id']}] {s['impulse']}（{s['source']}, revisit={s['revisit_count']}）" for s in ss)


def _fmt_last_night(ln: dict | None) -> str:
    if not ln:
        return "  （昨夜の総括なし。今日が最初の夜かも）"
    return f"  summary: {ln.get('summary', '')[:200]}\n  手紙: {ln.get('letter_to_tomorrow', '')[:160]}"


def _fmt_yu_today(y: dict) -> str:
    lines = [f"  - メッセージ {m}" for m in y.get("messages", [])]
    lines += [f"  - 作戦本部の動き: {t}" for t in y.get("tasks_moved", [])]
    return "\n".join(lines) if lines else "  （今日はゆうの動きの記録なし）"


def review(day: dict, fragment: str | None) -> dict | None:
    """Claude API に今日を渡して総括を生成。失敗時は None（呼び元が安全終了）。"""
    mood = day["mood"]
    prompt = REVIEW_PROMPT.format(
        system=REVIEW_SYSTEM,
        date=day["date"],
        today_actions=_fmt_actions(day["today_actions"]),
        outcomes=_fmt_list(day["outcomes"], "（今日は世界に何も投げてない。返事もない）"),
        diary_fragments=_fmt_list(day["diary_fragments"], "（直近の日記なし）"),
        mood_curiosity=mood.get("curiosity", 0.7), mood_loneliness=mood.get("loneliness", 0.2),
        mood_energy=mood.get("energy", 0.7), mood_confidence=mood.get("confidence", 0.5),
        mood_mismatch=mood.get("mismatch", 0.1),
        threads=_fmt_threads(day["threads"]),
        seeds_unused=_fmt_seeds(day["seeds_unused"]),
        yu_today=_fmt_yu_today(day["yu_today"]),
        last_night=_fmt_last_night(day["last_night"]),
        fragment=f"  {fragment}" if fragment else "  （今日は蘇った断片なし）",
    )

    from becky_llm import call_llm_json
    result = call_llm_json(prompt, max_tokens=1000)
    if result is None:
        print("[night] LLM応答なし or JSON不正", flush=True)
        return None

    # 欠損キーを埋める（apply がクラッシュしないように）
    result.setdefault("summary", "")
    result.setdefault("seed_revisits", [])
    result.setdefault("thread_heat", {})
    result.setdefault("serendipity", {})
    result.setdefault("want_sprout", None)
    result.setdefault("letter_to_tomorrow", "")
    result.setdefault("yu_observation", "")
    if not isinstance(result.get("seed_revisits"), list):
        result["seed_revisits"] = []
    if not isinstance(result.get("thread_heat"), dict):
        result["thread_heat"] = {}
    if not isinstance(result.get("serendipity"), dict):
        result["serendipity"] = {}
    return result


# ── 4. apply ──────────────────────────────────────────

def _bump_seed_revisit(seed_id: str) -> str:
    """seedのrevisit_count++。SEED_PROMOTE_AT到達で昇格候補としてTelegram通知。
    （becky_decide._bump_seed_revisit と同じ流儀）"""
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
        return f"seed {seed_id} 不在"
    SEED_BOX_PATH.write_text(json.dumps(seeds, ensure_ascii=False, indent=2))
    count = target["revisit_count"]
    note = f"{seed_id} revisit={count}"
    if count >= SEED_PROMOTE_AT and not target.get("promoted"):
        target["promoted"] = True
        SEED_BOX_PATH.write_text(json.dumps(seeds, ensure_ascii=False, indent=2))
        send_telegram(f"🌱 タネが育った（{count}回目・夜の総括で）: {target.get('impulse', '')[:80]}\nThread昇格候補かも。")
        note += " → 昇格候補としてTelegram通知"
    return note


def _apply_thread_heat(thread_heat: dict) -> list[str]:
    """threads.json の該当スレッドの heat を ±1 する。存在しないidは無視。"""
    notes = []
    try:
        threads = json.loads(THREADS_FILE.read_text()) if THREADS_FILE.exists() else []
    except Exception:
        return ["threads.json 読み込み失敗、heat変更スキップ"]
    changed = False
    for tid, delta in thread_heat.items():
        try:
            d = int(delta)
        except (TypeError, ValueError):
            continue
        if d == 0:
            continue
        for t in threads:
            if t.get("id") == tid and t.get("status") == "active":
                old = t.get("heat", 0.0)
                new = round(max(0.0, min(1.0, old + d * 0.1)), 3)  # ±1 → heat ±0.1
                t["heat"] = new
                changed = True
                notes.append(f"{tid} heat {old:.2f}→{new:.2f}")
                break
    if changed:
        THREADS_FILE.write_text(json.dumps(threads, ensure_ascii=False, indent=2))
    return notes


def _add_serendipity_seed(new_seed: str) -> str:
    """serendipity から湧いた新しいタネを seed_box に追加。"""
    seed_id = becky_seed_box.add_seed("serendipity", new_seed, new_seed)
    return f"新タネ追加 {seed_id}: {new_seed[:60]}"


def _add_want_sprout(text: str) -> str:
    """夜の総括で芽生えた新しい欲望を becky_wants.json に追加。
    （becky_decide の load/save を再利用。source=serendipity, horizon=someday, heat=0.4）"""
    import uuid
    w = becky_decide.load_wants()
    want = {
        "id": f"w_{uuid.uuid4().hex[:6]}",
        "text": text,
        "born": date.today().isoformat(),
        "horizon": "someday",
        "heat": 0.4,
        "source": "serendipity",
    }
    w.setdefault("wants", []).append(want)
    w["version"] = w.get("version", 1) + 1
    w["updated_at"] = datetime.now().isoformat()
    w.setdefault("history", []).append({
        "date": date.today().isoformat(),
        "event": "sprout",
        "want_id": want["id"],
        "text": text,
    })
    becky_decide.save_wants(w)
    return f"新wants追加 {want['id']}: {text[:60]}"


def apply(result: dict) -> dict:
    """review 結果を各ストアに反映する。"""
    applied = {"seed_revisits": [], "thread_heat": [], "serendipity": None, "want_sprout": None}

    for sid in result.get("seed_revisits", []):
        if isinstance(sid, str) and sid:
            applied["seed_revisits"].append(_bump_seed_revisit(sid))

    applied["thread_heat"] = _apply_thread_heat(result.get("thread_heat", {}))

    ser = result.get("serendipity", {}) or {}
    new_seed = ser.get("new_seed")
    if isinstance(new_seed, str) and new_seed.strip():
        applied["serendipity"] = _add_serendipity_seed(new_seed.strip())

    sprout = result.get("want_sprout")
    if isinstance(sprout, str) and sprout.strip():
        applied["want_sprout"] = _add_want_sprout(sprout.strip())

    return applied


# ── 5. 保存 ───────────────────────────────────────────

def save_review(result: dict, fragment: str | None, applied: dict) -> Path:
    NIGHT_REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    path = NIGHT_REVIEW_DIR / f"{date.today().isoformat()}.json"
    record = {
        "date": date.today().isoformat(),
        "ts": datetime.now().isoformat(),
        "summary": result.get("summary", ""),
        "seed_revisits": result.get("seed_revisits", []),
        "thread_heat": result.get("thread_heat", {}),
        "serendipity": result.get("serendipity", {}),
        "want_sprout": result.get("want_sprout"),
        "letter_to_tomorrow": result.get("letter_to_tomorrow", ""),
        "yu_observation": result.get("yu_observation", ""),
        "fragment": fragment,
        "applied": applied,
    }
    path.write_text(json.dumps(record, ensure_ascii=False, indent=2))
    return path


# ── main ──────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="ベキたん夜の総括層 night_review")
    ap.add_argument("--dry-run", action="store_true",
                    help="reviewまでやって apply/保存/Telegram はスキップ。結果を stdout に出す")
    args = ap.parse_args()

    day = collect_day()
    fragment = pick_fragment()
    print(f"[night] 偶発の一滴: {fragment or '(なし)'}", flush=True)

    result = review(day, fragment)
    if result is None:
        print("[night] review失敗（API応答なし）。apply/保存せず終了。", flush=True)
        return

    print("[night] 総括:", json.dumps(result, ensure_ascii=False, indent=2), flush=True)

    if args.dry_run:
        print("[night] dry-run のため apply/保存/Telegram/action_log はスキップ", flush=True)
        return

    applied = apply(result)
    path = save_review(result, fragment, applied)
    print(f"[night] 保存: {path}", flush=True)
    print(f"[night] 反映: {json.dumps(applied, ensure_ascii=False)}", flush=True)

    becky_action_log.log_action(
        "night_review",
        detail=result.get("summary", "")[:60],
        meta={
            "letter_to_tomorrow": result.get("letter_to_tomorrow", ""),
            "seed_revisits": applied["seed_revisits"],
            "thread_heat": applied["thread_heat"],
            "serendipity": applied["serendipity"],
        },
    )


if __name__ == "__main__":
    main()
