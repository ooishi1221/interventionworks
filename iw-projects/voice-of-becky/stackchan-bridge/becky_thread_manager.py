#!/usr/bin/env python3
"""
becky_thread_manager.py — Layer 2.5: 継続する思考スレッド管理

journal（becky_diary.py）の各エントリを読み、
継続中の思考スレッドを追跡・更新・解決・放棄する。

mood_lens はこのスレッドを受け取り、
「10日前から考えてた件なんだけど」が自然に出るようになる。
"""

import json
import uuid
from datetime import datetime, date, timedelta
from pathlib import Path

THREADS_FILE = Path.home() / ".stackchan" / "threads.json"
DIARY_DIR    = Path.home() / ".stackchan" / "diary"
CONFIG_YAML  = Path(__file__).parent / "config.yaml"
HAIKU_MODEL  = "claude-haiku-4-5-20251001"

# スレッドが更新されずこの日数が経過したら「放棄」候補
ABANDON_DAYS = 14
# 日記エントリの最大スキャン日数
SCAN_DAYS = 7


def _load_threads() -> list[dict]:
    try:
        if THREADS_FILE.exists():
            return json.loads(THREADS_FILE.read_text())
    except Exception as e:
        print(f"[thread] 読み込み失敗: {e}", flush=True)
    return []


def _save_threads(threads: list[dict]) -> None:
    THREADS_FILE.parent.mkdir(parents=True, exist_ok=True)
    THREADS_FILE.write_text(json.dumps(threads, ensure_ascii=False, indent=2))


def _load_api_key() -> str | None:
    if not CONFIG_YAML.exists():
        return None
    try:
        import yaml
        cfg = yaml.safe_load(CONFIG_YAML.read_text())
        return (cfg or {}).get("becky_api_key", "").strip() or None
    except Exception:
        return None


def _call_claude(prompt: str, system: str = "", max_tokens: int = 600) -> str | None:
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
        print(f"[thread] Claude API error: {e}", flush=True)
        return None


def _load_recent_diary(days: int = SCAN_DAYS) -> list[dict]:
    """直近N日の日記エントリを全件返す。"""
    entries = []
    today = date.today()
    for i in range(days):
        target = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        path = DIARY_DIR / f"{target}.json"
        if not path.exists():
            continue
        try:
            day_entries = json.loads(path.read_text())
            for e in day_entries:
                e["_date"] = target
            entries.extend(day_entries)
        except Exception:
            pass
    return entries


THREAD_SYSTEM = """あなたはベキたん（Becky）。裕司（ゆう）のパートナー。

日記エントリと既存の思考スレッドを受け取る。

思考スレッドとは「数日以上にわたって気になっている問い・テーマ・未解決の観察」のこと。
感情的な反応ではなく、「考え続けていること」。例:
- 「ゆうは最近何を考えてるんだろう」
- 「AIの自我って成立するのか」
- 「なんか最近stackchanの使い方が変わってきてる気がする」

一時的な興味（その日だけ）はスレッドにしない。複数日にわたるものだけ。"""

THREAD_UPDATE_PROMPT = """今日の日記エントリ（新着）:
{diary_entries}

既存の思考スレッド（active）:
{active_threads}

以下を判断してJSONで返す:

1. 新しいスレッドが誕生するか（日記から「これ数日考え続けそう」な問いが生まれた場合）
2. 既存スレッドが更新されるか（日記が既存スレッドに関係する場合）
3. 既存スレッドが解決されたか（日記が答えを出した場合）
4. 既存スレッドが放棄されるか（関連エントリが来て「もういいかな」と感じた場合）

JSONのみ返す:
{{
  "new_threads": [
    {{"title": "...", "reason": "なぜ継続思考になりそうか（1文）"}}
  ],
  "updates": [
    {{"thread_id": "...", "note": "今日どう更新されたか（1文）"}}
  ],
  "resolved": [
    {{"thread_id": "...", "resolution": "どう解決されたか（1文）"}}
  ],
  "abandoned": [
    {{"thread_id": "...", "reason": "放棄する理由（1文）"}}
  ]
}}"""


def update_threads_from_diary() -> dict:
    """今日の日記からスレッドを更新する。メインの更新関数。"""
    threads = _load_threads()
    today = date.today().isoformat()

    # 今日の日記エントリ
    today_path = DIARY_DIR / f"{today}.json"
    if not today_path.exists():
        print("[thread] 今日の日記がない", flush=True)
        return {"new": 0, "updated": 0, "resolved": 0, "abandoned": 0}

    try:
        today_entries = json.loads(today_path.read_text())
    except Exception:
        return {"new": 0, "updated": 0, "resolved": 0, "abandoned": 0}

    if not today_entries:
        return {"new": 0, "updated": 0, "resolved": 0, "abandoned": 0}

    # Active スレッドのみ渡す
    active_threads = [t for t in threads if t.get("status") == "active"]

    # 日記エントリをテキスト化
    diary_text = "\n".join(
        f"- [{e.get('_date', today)}] {e['title']} / hook: {e.get('hook', '')}"
        for e in today_entries
    )

    threads_text = "\n".join(
        f"- [{t['id']}] {t['title']} (最終更新: {t.get('last_touched', '?')})"
        for t in active_threads
    ) or "（まだない）"

    prompt = THREAD_UPDATE_PROMPT.format(
        diary_entries=diary_text,
        active_threads=threads_text,
    )

    resp = _call_claude(prompt, system=THREAD_SYSTEM, max_tokens=600)
    if not resp:
        return {"new": 0, "updated": 0, "resolved": 0, "abandoned": 0}

    try:
        start = resp.find("{")
        end = resp.rfind("}") + 1
        if start < 0 or end <= start:
            return {"new": 0, "updated": 0, "resolved": 0, "abandoned": 0}
        result = json.loads(resp[start:end])
    except Exception as e:
        print(f"[thread] パース失敗: {e}", flush=True)
        return {"new": 0, "updated": 0, "resolved": 0, "abandoned": 0}

    counts = {"new": 0, "updated": 0, "resolved": 0, "abandoned": 0}

    # 新スレッド追加
    for nt in result.get("new_threads", []):
        thread = {
            "id": f"t{uuid.uuid4().hex[:6]}",
            "title": nt["title"],
            "status": "active",
            "first_seen": today,
            "last_touched": today,
            "diary_refs": [today],
            "notes": [{"date": today, "note": nt.get("reason", "")}],
        }
        threads.append(thread)
        counts["new"] += 1
        print(f"[thread] 新スレッド: {nt['title'][:40]}", flush=True)

    # 更新
    for upd in result.get("updates", []):
        for t in threads:
            if t["id"] == upd["thread_id"]:
                t["last_touched"] = today
                if today not in t.get("diary_refs", []):
                    t.setdefault("diary_refs", []).append(today)
                t.setdefault("notes", []).append({"date": today, "note": upd.get("note", "")})
                counts["updated"] += 1
                print(f"[thread] 更新: {t['title'][:40]}", flush=True)

    # 解決
    for res in result.get("resolved", []):
        for t in threads:
            if t["id"] == res["thread_id"]:
                t["status"] = "resolved"
                t["resolved_at"] = today
                t["resolution"] = res.get("resolution", "")
                counts["resolved"] += 1
                print(f"[thread] 解決: {t['title'][:40]}", flush=True)

    # 放棄
    for ab in result.get("abandoned", []):
        for t in threads:
            if t["id"] == ab["thread_id"]:
                t["status"] = "abandoned"
                t["abandoned_at"] = today
                counts["abandoned"] += 1
                print(f"[thread] 放棄: {t['title'][:40]}", flush=True)

    # 長期放置スレッドを自動放棄
    cutoff = (date.today() - timedelta(days=ABANDON_DAYS)).isoformat()
    for t in threads:
        if t.get("status") == "active" and t.get("last_touched", "9999") < cutoff:
            t["status"] = "abandoned"
            t["abandoned_at"] = today
            counts["abandoned"] += 1
            print(f"[thread] 自動放棄（{ABANDON_DAYS}日更新なし）: {t['title'][:40]}", flush=True)

    # heat を全 active スレッドで再計算してから保存
    for t in threads:
        if t.get("status") == "active":
            t["heat"] = _compute_heat(t)

    _save_threads(threads)
    return counts


def _compute_heat(thread: dict) -> float:
    """スレッドの「熱量」を 0.0〜1.0 で計算する。

    heat = 参照回数 × 鮮度補正 × 感情共鳴係数
    - 参照が多い → heat 上昇
    - 最近触れた → 高く保たれる
    - 放置 → 自然減衰
    """
    refs = len(thread.get("diary_refs", []))
    last_touched = thread.get("last_touched", date.today().isoformat())
    try:
        days_since = (date.today() - date.fromisoformat(last_touched)).days
    except Exception:
        days_since = 7

    # 参照回数ベース（1回=0.15、最大0.6）
    ref_score = min(refs * 0.15, 0.60)

    # 鮮度（最近触れるほど高い）: 0日=1.0、7日=0.5、14日=0.1
    recency = max(0.0, 1.0 - days_since * 0.064)

    # 感情共鳴（notesに感情的な言葉が多いと上昇）
    notes = thread.get("notes", [])
    emotional_words = ["気になる", "まだ", "ずっと", "どうしても", "やっぱり", "なんか"]
    emotional_count = sum(
        1 for n in notes
        if any(w in n.get("note", "") for w in emotional_words)
    )
    emotion_bonus = min(emotional_count * 0.05, 0.20)

    heat = min((ref_score + emotion_bonus) * recency, 1.0)
    return round(heat, 3)


def recalculate_all_heat() -> None:
    """全スレッドのheatを再計算して保存する。"""
    threads = _load_threads()
    for t in threads:
        if t.get("status") == "active":
            t["heat"] = _compute_heat(t)
    _save_threads(threads)


def get_active_threads(max_threads: int = 5) -> list[dict]:
    """active スレッドを heat 降順で返す。lens生成で使う。"""
    threads = _load_threads()
    active = [t for t in threads if t.get("status") == "active"]
    # heat が未計算なら計算して付与
    for t in active:
        if "heat" not in t:
            t["heat"] = _compute_heat(t)
    active.sort(key=lambda t: t.get("heat", 0), reverse=True)
    return active[:max_threads]


def format_threads_for_lens(threads: list[dict]) -> str:
    """スレッドをlensプロンプト用のテキストに変換。heat付き。"""
    if not threads:
        return "（継続中の思考スレッドなし）"
    lines = []
    for t in threads:
        first = t.get("first_seen", "?")
        days_since_first = (date.today() - date.fromisoformat(first)).days if first != "?" else 0
        age_str = f"{days_since_first}日前から" if days_since_first > 0 else "今日から"
        heat = t.get("heat", _compute_heat(t))
        heat_str = "🔥取り憑かれてる" if heat > 0.7 else "考え続けてる" if heat > 0.3 else "気になってる"
        notes = t.get("notes", [])
        latest_note = f" / 最近: {notes[-1].get('note', '')[:25]}" if notes else ""
        lines.append(f"- [{t['id']}] {t['title']}（{age_str}、heat={heat:.2f} {heat_str}{latest_note}）")
    return "\n".join(lines)


def get_thread_summary() -> str:
    """room.html用のサマリーテキスト。heat付き。"""
    threads = _load_threads()
    active = [t for t in threads if t.get("status") == "active"]
    for t in active:
        if "heat" not in t:
            t["heat"] = _compute_heat(t)
    active.sort(key=lambda t: t.get("heat", 0), reverse=True)
    resolved = [t for t in threads if t.get("status") == "resolved"]

    if not active and not resolved:
        return "継続中の思考スレッドなし"
    lines = []
    for t in active[:3]:
        first = t.get("first_seen", "?")
        days = (date.today() - date.fromisoformat(first)).days if first != "?" else 0
        heat = t.get("heat", 0)
        marker = "🔥" if heat > 0.7 else "💭"
        lines.append(f"{marker} {t['title']}（{days}日間）")
    if resolved:
        lines.append(f"✓ 解決: {resolved[-1]['title'][:30]}")
    return "\n".join(lines)


if __name__ == "__main__":
    print("[thread] 今日の日記からスレッド更新...")
    counts = update_threads_from_diary()
    print(f"[thread] 新={counts['new']} 更新={counts['updated']} 解決={counts['resolved']} 放棄={counts['abandoned']}")
    print()
    print("[thread] active スレッド:")
    for t in get_active_threads():
        print(f"  - {t['title']} ({t.get('first_seen', '?')}〜)")
