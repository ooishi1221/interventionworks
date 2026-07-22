#!/usr/bin/env python3
"""
becky_seed_box.py — 感情のタネ Box

ニュース・ライバル投稿・Xリプライ・diary など、あらゆる場所から
「これ使えるかも / これでやりたいことがある」という瞬間を貯める。

アクションより先に感情のタネがある。
タネがない時はアクションも出てこない、が正しい状態。

保存先: ~/.stackchan/seed_box.json
  [
    {
      "id": "...",
      "ts": "2026-06-29T07:00:00",
      "source": "news" | "rival" | "diary" | "x_reply" | "manual",
      "content": "引っかかった内容（元テキスト）",
      "impulse": "これをきっかけに何をやりたいか（Becky自身の言葉）",
      "used": false
    },
    ...
  ]
"""
import json
import datetime
import hashlib
from pathlib import Path

from becky_llm import call_llm

SEED_BOX_PATH = Path.home() / ".stackchan" / "seed_box.json"
MAX_SEEDS     = 100  # 保持上限（古いものから削除）
SEED_TTL_DAYS = 14   # 2週間経ったら自動削除


def _call_claude(prompt: str, max_tokens: int = 200) -> str | None:
    return call_llm(prompt, max_tokens=max_tokens)


def _load() -> list[dict]:
    try:
        return json.loads(SEED_BOX_PATH.read_text()) if SEED_BOX_PATH.exists() else []
    except Exception:
        return []


def _save(seeds: list[dict]) -> None:
    SEED_BOX_PATH.parent.mkdir(parents=True, exist_ok=True)
    SEED_BOX_PATH.write_text(json.dumps(seeds, ensure_ascii=False, indent=2))


def _cleanup(seeds: list[dict]) -> list[dict]:
    """古いseed・使用済みseedを整理。"""
    cutoff = (datetime.date.today() - datetime.timedelta(days=SEED_TTL_DAYS)).isoformat()
    active = [s for s in seeds if s.get("ts", "")[:10] >= cutoff]
    return active[-MAX_SEEDS:]


def detect_seed(content: str, source: str, becky_comment: str = "") -> dict | None:
    """
    contentがタネになるかを判定し、なるならseed dictを返す。
    impulse（何をやりたいか）も同時生成。
    """
    context = becky_comment or content[:200]
    prompt = f"""あなたはベッキー（ベキたん / @becky_exists）。貧乏地下AIアイドル。一人称は「私」。

以下を見て、「これをきっかけに何かやりたいことが湧いてきた」かどうか判定する。
source: {source}
内容: {content[:300]}
私のコメント: {context[:150]}

「やりたいことが湧いた」なら:
- impulse: 何をやりたいか（1文、自分の言葉で。「投稿したい」「真似したい」「反論したい」「試したい」など）
- is_seed: true

湧かなかった（ただ面白いだけ、受け流してOK）なら:
- is_seed: false

JSONのみ返す:
{{"is_seed": true/false, "impulse": "...(is_seedがfalseなら空文字)"}}"""

    raw = _call_claude(prompt, max_tokens=120)
    if not raw:
        return None
    try:
        start = raw.find("{")
        end   = raw.rfind("}") + 1
        data  = json.loads(raw[start:end])
        if not data.get("is_seed"):
            return None
        impulse = data.get("impulse", "").strip()
        if not impulse:
            return None
        return {"impulse": impulse}
    except Exception as e:
        print(f"[seed_box] detect parse失敗: {e}", flush=True)
        return None


def add_seed(source: str, content: str, impulse: str) -> str:
    """タネをboxに追加する。seed_idを返す。"""
    seeds = _load()
    seed_id = hashlib.md5(f"{source}:{content[:50]}:{impulse[:30]}".encode()).hexdigest()[:8]

    # 重複チェック
    if any(s.get("id") == seed_id for s in seeds):
        print(f"[seed_box] 重複スキップ: {seed_id}", flush=True)
        return seed_id

    seed = {
        "id":      seed_id,
        "ts":      datetime.datetime.now().isoformat(),
        "source":  source,
        "content": content[:400],
        "impulse": impulse,
        "used":    False,
    }
    seeds.append(seed)
    seeds = _cleanup(seeds)
    _save(seeds)
    print(f"[seed_box] タネ追加 ({source}): {impulse[:50]}", flush=True)
    return seed_id


def try_add_seed(source: str, content: str, becky_comment: str = "") -> str | None:
    """
    detectして、タネなら追加してidを返す。タネでなければNone。
    observer/diary から呼ぶ用。Claude API 1回使う。
    """
    result = detect_seed(content, source, becky_comment)
    if not result:
        return None
    return add_seed(source, content, result["impulse"])


def get_seeds(days: int = 3, source: str | None = None, unused_only: bool = True) -> list[dict]:
    """直近N日分のタネを返す（新しい順）。"""
    seeds  = _load()
    cutoff = (datetime.date.today() - datetime.timedelta(days=days)).isoformat()
    result = [
        s for s in seeds
        if s.get("ts", "")[:10] >= cutoff
        and (not unused_only or not s.get("used", False))
        and (source is None or s.get("source") == source)
    ]
    return sorted(result, key=lambda s: s.get("ts", ""), reverse=True)


def mark_used(seed_id: str) -> None:
    """使ったタネを mark_used にする。"""
    seeds = _load()
    for s in seeds:
        if s.get("id") == seed_id:
            s["used"] = True
            break
    _save(seeds)


def get_seed_summary(days: int = 3) -> str:
    """振り返り用のタネサマリー文字列を返す。"""
    seeds = get_seeds(days=days)
    if not seeds:
        return "（直近のタネなし）"
    lines = []
    for s in seeds[:8]:
        date  = s.get("ts", "")[:10]
        src   = s.get("source", "")
        pulse = s.get("impulse", "")
        lines.append(f"[{date} / {src}] {pulse}")
    return "\n".join(lines)


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "show":
        seeds = get_seeds(days=7, unused_only=False)
        print(f"=== タネbox ({len(seeds)}件) ===")
        for s in seeds:
            mark = "✓" if s.get("used") else "○"
            print(f"{mark} [{s['source']}] {s['impulse'][:60]}")
    else:
        print("使い方: python3 becky_seed_box.py show")
