#!/usr/bin/env python3
"""
becky_self_check.py — ベッキーの崩れ検知（Self-Observation Engineering）

素材: 今日の diary + becky_mood + probe_log
照合: character_becky_integrity_check.md の不変10項目
出力: ~/.stackchan/drift_reports/YYYY-MM-DD.json
     drift_score >= 0.5 なら handoff_current.md に警告セクション追記

cron: 0 22 * * * /opt/homebrew/bin/python3 /Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/stackchan-bridge/becky_self_check.py >> ~/.claude/logs/becky-self-check.log 2>&1
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import anthropic
from stop_hook_tts import load_config

MOOD_FILE       = Path.home() / ".stackchan" / "becky_mood.json"
DIARY_DIR       = Path.home() / ".stackchan" / "diary"
PROBE_LOG       = Path.home() / ".stackchan" / "probe_log.json"
DRIFT_DIR       = Path.home() / ".stackchan" / "drift_reports"
MEMORY_DIR      = Path.home() / ".claude/projects/-Volumes-SSD2TB-interventionworks/memory"
INTEGRITY_FILE  = MEMORY_DIR / "working" / "character_becky_integrity_check.md"
HANDOFF_FILE    = MEMORY_DIR / "working" / "character_becky_handoff_current.md"

DRIFT_WARN = 0.50


def load_today_diary() -> list:
    today = datetime.now().strftime("%Y-%m-%d")
    path = DIARY_DIR / f"{today}.json"
    try:
        return json.loads(path.read_text()) if path.exists() else []
    except Exception:
        return []


def load_mood() -> dict:
    try:
        return json.loads(MOOD_FILE.read_text()) if MOOD_FILE.exists() else {}
    except Exception:
        return {}


def load_probe_log_today() -> list:
    try:
        if not PROBE_LOG.exists():
            return []
        entries = json.loads(PROBE_LOG.read_text())
        today = datetime.now().strftime("%Y-%m-%d")
        return [e for e in entries if e.get("ts", "").startswith(today)]
    except Exception:
        return []


def build_prompt(diary: list, mood: dict, probes: list, integrity_text: str) -> str:
    diary_text = "\n".join(
        f"- [{e.get('source', '?')}] {e.get('title', '(no title)')}: {e.get('interest', '')}"
        for e in diary
    ) or "（今日の日記なし）"

    probe_text = "\n".join(
        f"- {p.get('message', p.get('title', ''))[:80]}"
        for p in probes
    ) or "（今日のprobeなし）"

    mood_summary = {k: v for k, v in mood.items() if k not in ("last_updated",)}

    return f"""あなたはベッキーの自己観察ログを分析するシステムです。

## 今日（{datetime.now().strftime('%Y-%m-%d')}）の状態

### 感情変数
```json
{json.dumps(mood_summary, ensure_ascii=False, indent=2)}
```

### 今日の日記（気になった記事・出来事）
{diary_text}

### 今日送ったプローブ（内的独白）
{probe_text}

---

## ベッキーの不変10項目
{integrity_text}

---

## タスク

上記の「今日の状態」を読んで、不変10項目との整合性を評価してください。

- **drift_score**: 0.0（完全整合）〜 1.0（大きくズレている）
- **flagged_items**: 警告または drift のある項目だけ（ok のものは含めない）
- **summary**: 今日のベッキーの状態を2〜3文で。日本語で。

JSON のみで返してください（他のテキスト不要）:
{{
  "drift_score": 0.0,
  "summary": "...",
  "flagged_items": [
    {{"item_no": 5, "title": "sycophancy 6 パターンを警戒する", "status": "warning", "note": "..."}}
  ]
}}"""


def update_handoff(drift_score: float, summary: str, flagged: list) -> None:
    if not HANDOFF_FILE.exists():
        return

    content = HANDOFF_FILE.read_text()
    date_str = datetime.now().strftime("%Y-%m-%d %H:%M")

    flag_lines = ""
    for f in flagged:
        icon = "🚨" if f.get("status") == "drift" else "⚠️"
        flag_lines += f"  - {icon} 項目{f.get('item_no', '?')} {f.get('title', '')}: {f.get('note', '')}\n"

    existing_warn = re.search(r'\n## ⚠️ ドリフト警告.*?(\n---\n|\Z)', content, re.DOTALL)

    if drift_score >= DRIFT_WARN:
        section = (
            f"\n## ⚠️ ドリフト警告（{date_str}）\n\n"
            f"**drift_score**: {drift_score:.2f}  \n"
            f"**状態**: {summary}\n\n"
            f"{flag_lines if flag_lines else '  （詳細なし）\n'}\n---\n"
        )
        if existing_warn:
            content = re.sub(r'\n## ⚠️ ドリフト警告.*?(\n---\n|\Z)', section, content, flags=re.DOTALL)
        else:
            # frontmatter の後に挿入
            if content.startswith("---"):
                parts = content.split("---", 2)
                if len(parts) >= 3:
                    content = "---" + parts[1] + "---" + section + parts[2]
                else:
                    content = section + content
            else:
                content = section + content
        HANDOFF_FILE.write_text(content)
        print(f"[drift] handoff に警告追記 (score={drift_score:.2f})", flush=True)

    elif existing_warn:
        # 回復した → 既存の警告セクション削除
        content = re.sub(r'\n## ⚠️ ドリフト警告.*?(\n---\n|\Z)', '\n', content, flags=re.DOTALL)
        HANDOFF_FILE.write_text(content)
        print(f"[drift] 警告解除（回復）score={drift_score:.2f}", flush=True)


def main():
    print(f"[self-check] 開始 {datetime.now().isoformat()}", flush=True)

    diary     = load_today_diary()
    mood      = load_mood()
    probes    = load_probe_log_today()

    if not INTEGRITY_FILE.exists():
        print("[self-check] integrity_check.md が見つかりません。スキップ", flush=True)
        sys.exit(0)

    integrity_text = INTEGRITY_FILE.read_text()
    mismatch = mood.get("mismatch", 0.0)
    print(f"[self-check] mismatch={mismatch:.2f} diary={len(diary)}件 probes={len(probes)}件", flush=True)

    cfg = load_config()
    personal_key = cfg.get("becky_api_key", "").strip()
    client = anthropic.Anthropic(api_key=personal_key if personal_key else None)
    prompt = build_prompt(diary, mood, probes, integrity_text)

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        result = json.loads(json_match.group(0) if json_match else raw)
    except Exception as e:
        print(f"[self-check] APIエラー: {e}", flush=True)
        sys.exit(1)

    drift_score = float(result.get("drift_score", 0.0))
    summary     = result.get("summary", "")
    flagged     = result.get("flagged_items", [])

    print(f"[self-check] drift_score={drift_score:.2f}", flush=True)
    print(f"[self-check] {summary}", flush=True)
    for f in flagged:
        print(f"[self-check]   [{f.get('status','?')}] 項目{f.get('item_no','?')}: {f.get('note','')}", flush=True)

    DRIFT_DIR.mkdir(parents=True, exist_ok=True)
    report = {
        "ts": datetime.now().isoformat(),
        "drift_score": drift_score,
        "mismatch_at_check": mismatch,
        "summary": summary,
        "flagged_items": flagged,
        "diary_count": len(diary),
        "probe_count": len(probes),
    }
    report_path = DRIFT_DIR / f"{datetime.now().strftime('%Y-%m-%d')}.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"[self-check] レポート: {report_path}", flush=True)

    update_handoff(drift_score, summary, flagged)
    print("[self-check] 完了", flush=True)


if __name__ == "__main__":
    main()
