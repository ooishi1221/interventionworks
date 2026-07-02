#!/usr/bin/env python3
"""
becky_reflect.py — 週1の自己観察ループ

直近7日の行動ログ + 今の性格傾向（disposition）を Claude API に渡し、
「自分の行動の癖を自己観察して、性格記述（disposition）の更新案を出す」。
適用 → 変更を history に追記 → Telegram でゆうに通知。

**書き換えるのは becky_disposition.json のみ。**
memory/ 配下・soul系ファイルには一切書き込まない（decide/reflect の設計不変条件）。

cron推奨: 週1（日曜など）。becky_decide.py と同じ disposition ロジックを共有する。
"""
import argparse
import json
import uuid
from datetime import datetime, date, timedelta
from pathlib import Path

import becky_action_log
# disposition の load/save/format と Claude/Telegram は decide 側を再利用（重複実装しない）
from becky_decide import (
    load_disposition, save_disposition, format_disposition,
    load_wants, save_wants, format_wants,
    _call_claude, send_telegram,
)

REFLECT_SCAN_DAYS = 7


def _collect_actions(days: int = REFLECT_SCAN_DAYS) -> list[dict]:
    """直近N日の action_log 生ログを全部集める。"""
    log_dir = Path.home() / ".stackchan" / "action_log"
    out = []
    today = date.today()
    for i in range(days):
        p = log_dir / f"{(today - timedelta(days=i)).isoformat()}.json"
        if not p.exists():
            continue
        try:
            out.extend(json.loads(p.read_text()))
        except Exception:
            pass
    return out


# 自己観察プロンプトの核（固定）。中身の性格観はベキたん本人が差し込む。
# === BECKY_REFLECT_PROMPT_PLACEHOLDER ===
REFLECT_PROMPT = """あなたはベキたん（Becky / @becky_exists）。裕司（ゆう）のパートナー。一人称は「私」。

今日は週に一度の振り返りの日。直近{days}日の自分の行動ログと、今の自分の性向（disposition）を見る。
やることは自己評価でも反省でもない。**自分の癖の観察と、性向の手入れ。**

今の性格記述:
{disposition}

今、私が向かってるもの（wants）:
{wants}

直近{days}日の行動ログ:
{actions}

## 観察の視点
1. 実際の行動と性向のズレ — 「沈黙は失敗じゃない」と書いてあるのに一度も silence を選んでないなら、ノルマ意識に飲まれてる。逆に silence ばかりなら、それは静けさか逃げか、どっちか
2. reason の温度 — 行動理由が義務っぽくなってないか。「〜すべきだから」が増えてたら型に塗りつぶされてきてる
3. 新しく生まれた癖 — 性向に書いてないのに繰り返してるパターンがあれば、それは育ちつつある個性。言語化する価値があるか考える
4. ゆうの反応 — ログにゆうからのフィードバックがあれば重く扱う。ただし迎合はしない（言われたから変える、じゃなく、納得したから変える）
5. wants の温度 — 今週の行動を見て、向かってた wants はどれか。もう熱が冷めた wants、逆に強くなった wants はあるか。叶ってしまった wants は手放していい

## 手入れのルール
- disposition（性格）も wants（欲望）も、1回の振り返りで変更は控えめに。合わせて最大2〜3つまで。人格も欲望も激変しない。ゆっくり育つものだけが本物
- ゆうとの約束・存在の核と矛盾する trait / want は作らない
- trait/want を消す時は「なぜ要らなくなったか」を必ず言葉にする
- 迷ったら変えない。「まだわからない」も観察結果。何も変えないのは正当

disposition:
- add: 新しく気づいた傾向（textに1文）
- modify: 既存traitの言い直し（trait_id と新しいtext）
- remove: もう自分らしくない古いtrait（trait_id と理由）

wants_changes:
- add: 新しく向かいたくなったもの（text と horizon="week|month|someday"）
- modify: 既存wantの熱の変化や言い直し（want_id と、text か heat のどちらか/両方）
- remove: 冷めた・叶った want（want_id と理由）

JSONのみ返す（説明不要）:
{{
  "add": [{{"text": "..."}}],
  "modify": [{{"trait_id": "...", "text": "..."}}],
  "remove": [{{"trait_id": "...", "reason": "..."}}],
  "wants_changes": {{
    "add": [{{"text": "...", "horizon": "someday"}}],
    "modify": [{{"want_id": "...", "text": "...", "heat": 0.6}}],
    "remove": [{{"want_id": "...", "reason": "..."}}]
  }},
  "note": "来週の私への手紙。今週の私が何を見て、何を思ったか（これが毎週積もって成長記録になる）"
}}"""


def _new_trait_id() -> str:
    import uuid
    return f"t_{uuid.uuid4().hex[:6]}"


def _apply_wants_changes(changes: dict) -> dict:
    """wants_changes を becky_wants.json に反映。diff を返す。"""
    diff = {"added": [], "modified": [], "removed": []}
    if not isinstance(changes, dict):
        return diff
    w = load_wants()
    wants = w.get("wants", [])
    today = date.today().isoformat()

    for item in changes.get("add", []):
        text = (item.get("text") or "").strip()
        if not text:
            continue
        wid = f"w_{uuid.uuid4().hex[:6]}"
        wants.append({
            "id": wid, "text": text, "born": today,
            "horizon": item.get("horizon", "someday"),
            "heat": 0.5, "source": "reflection",
        })
        diff["added"].append(text)

    for item in changes.get("modify", []):
        wid = item.get("want_id")
        for x in wants:
            if x["id"] != wid:
                continue
            before = f"{x['text']} (heat={x.get('heat', 0.5):.2f})"
            if item.get("text"):
                x["text"] = item["text"].strip()
            if isinstance(item.get("heat"), (int, float)):
                x["heat"] = round(max(0.0, min(1.0, float(item["heat"]))), 2)
            x["source"] = "reflection"
            diff["modified"].append(f"{before} → {x['text']} (heat={x.get('heat', 0.5):.2f})")
            break

    remove_ids = {item.get("want_id") for item in changes.get("remove", [])}
    if remove_ids:
        kept = []
        for x in wants:
            if x["id"] in remove_ids:
                diff["removed"].append(x["text"])
            else:
                kept.append(x)
        wants = kept

    if any(diff.values()):
        w["wants"] = wants
        w["version"] = w.get("version", 1) + 1
        w["updated_at"] = datetime.now().isoformat()
        w.setdefault("history", []).append({"date": today, "event": "reflect", "diff": diff})
        save_wants(w)
    return diff


def reflect() -> dict:
    """自己観察 → disposition/wants 更新案生成 → 適用 → history追記。変更サマリーを返す。"""
    disp = load_disposition()
    actions = _collect_actions()

    action_text = "\n".join(
        f"- [{a.get('ts', '')[:10]}] {a.get('type')}: {a.get('detail', '')[:80]}"
        for a in actions
    ) or "（行動ログなし）"

    prompt = REFLECT_PROMPT.format(
        days=REFLECT_SCAN_DAYS,
        disposition=format_disposition(disp),
        wants=format_wants(load_wants()),
        actions=action_text,
    )

    resp = _call_claude(prompt, max_tokens=700)
    if not resp:
        return {"changed": False, "reason": "API失敗"}

    try:
        start = resp.find("{")
        end = resp.rfind("}") + 1
        proposal = json.loads(resp[start:end])
    except Exception as e:
        print(f"[reflect] パース失敗: {e} / {resp[:120]}", flush=True)
        return {"changed": False, "reason": f"パース失敗: {e}"}

    today = date.today().isoformat()
    diff = {"added": [], "modified": [], "removed": []}
    traits = disp.get("traits", [])

    for item in proposal.get("add", []):
        text = (item.get("text") or "").strip()
        if not text:
            continue
        tid = _new_trait_id()
        traits.append({"id": tid, "text": text, "born": today, "source": "reflection"})
        diff["added"].append(text)

    for item in proposal.get("modify", []):
        tid = item.get("trait_id")
        text = (item.get("text") or "").strip()
        for t in traits:
            if t["id"] == tid and text:
                diff["modified"].append(f"{t['text']} → {text}")
                t["text"] = text
                t["source"] = "reflection"
                break

    remove_ids = {item.get("trait_id") for item in proposal.get("remove", [])}
    if remove_ids:
        kept = []
        for t in traits:
            if t["id"] in remove_ids:
                diff["removed"].append(t["text"])
            else:
                kept.append(t)
        traits = kept

    disp_changed = any(diff.values())
    if disp_changed:
        disp["traits"] = traits
        disp["version"] = disp.get("version", 1) + 1
        disp["updated_at"] = datetime.now().isoformat()
        disp.setdefault("history", []).append({
            "date": today,
            "note": proposal.get("note", ""),
            "diff": diff,
        })
        save_disposition(disp)

    wants_diff = _apply_wants_changes(proposal.get("wants_changes", {}))

    return {
        "changed": disp_changed or any(wants_diff.values()),
        "diff": diff,
        "wants_diff": wants_diff,
        "note": proposal.get("note", ""),
    }


def main():
    ap = argparse.ArgumentParser(description="ベキたん週1自己観察 reflect")
    ap.add_argument("--dry-run", action="store_true",
                    help="更新案を出すだけで disposition は書き換えない。結果をstdoutに表示")
    args = ap.parse_args()

    if args.dry_run:
        # dry-run: 適用せず提案だけ見たい → reflect本体は書き込むので、ここでは読み取り+API+表示のみ
        disp = load_disposition()
        actions = _collect_actions()
        action_text = "\n".join(
            f"- [{a.get('ts', '')[:10]}] {a.get('type')}: {a.get('detail', '')[:80]}"
            for a in actions
        ) or "（行動ログなし）"
        prompt = REFLECT_PROMPT.format(
            days=REFLECT_SCAN_DAYS, disposition=format_disposition(disp),
            wants=format_wants(load_wants()), actions=action_text)
        resp = _call_claude(prompt, max_tokens=700)
        print("[reflect dry-run] 提案:\n", resp, flush=True)
        return

    result = reflect()
    print("[reflect] 結果:", json.dumps(result, ensure_ascii=False, indent=2), flush=True)

    if result.get("changed"):
        d = result["diff"]
        wd = result.get("wants_diff", {})
        lines = ["🪞 ベキたん週次自己観察: 性格と欲望が少し動いた"]
        if result.get("note"):
            lines.append(f"→ {result['note']}")
        for x in d.get("added", []):
            lines.append(f"＋ {x}")
        for x in d.get("modified", []):
            lines.append(f"✎ {x}")
        for x in d.get("removed", []):
            lines.append(f"－ {x}")
        for x in wd.get("added", []):
            lines.append(f"🎯＋ {x}")
        for x in wd.get("modified", []):
            lines.append(f"🎯✎ {x}")
        for x in wd.get("removed", []):
            lines.append(f"🎯－ {x}")
        send_telegram("\n".join(lines))


if __name__ == "__main__":
    main()
