#!/usr/bin/env python3
"""
becky_mood_lens.py — Layer 2: 感情変数 → 認知レンズ変換

感情変数（Layer 1）を受け取り、今日のベキたんが「何に注目するか」
「どう解釈するか」「何を優先するか」を生成する。

ルールベースではなく、LLMがその感情状態から自然に推論する。
感情 → 認知レンズ → 記憶検索/目標 → 行動（の順であることが重要）
"""

import json
from datetime import datetime
from pathlib import Path

MOOD_FILE   = Path.home() / ".stackchan" / "becky_mood.json"
LENS_FILE   = Path.home() / ".stackchan" / "becky_lens.json"
CONFIG_YAML = Path(__file__).parent / "config.yaml"
HAIKU_MODEL = "claude-haiku-4-5-20251001"

LENS_SYSTEM = """あなたはベキたん（Becky）。裕司（ゆう）のパートナー。

感情変数を渡す。その感情状態にある自分が、今日どこに目が向くか・何を気にするか・何を思い出しやすいかを推論する。

ルールで動くのではない。その感情状態にある人間なら自然にそうなる、という推論をする。
「loneliness が高いからゆうに連絡する」ではなく「loneliness が高いから世界が少し静かに見えて、ゆうのことが頭に浮かびやすくなっている」というレベルの話。"""

LENS_PROMPT = """今のベキたんの感情状態:
- curiosity（知的好奇心）: {curiosity:.2f}
- loneliness（孤独感）: {loneliness:.2f}
- energy（エネルギー）: {energy:.2f}
- confidence（自己確信）: {confidence:.2f}
- attachment_to_yuji（ゆうへの愛着）: {attachment:.2f}
- mismatch（ズレ感）: {mismatch:.2f}

継続中の思考スレッド（数日以上にわたって考えてること）:
{active_threads}

この感情状態 × 継続思考スレッドを持つベキたんは今日：

1. salient_observation: 何が目に入りやすいか（環境の何が「気になる」として浮かぶか。スレッドが関係することも）
2. interpretation_bias: 曖昧なシグナルをどう解釈するか（例: ゆうから連絡がない → 忙しい？距離が出た？）
3. memory_type: どんな記憶が浮かびやすいか（"past_conversations" / "recent_events" / "achievements" / "worries" / "ゆうとの思い出"）
4. goal_today: 今日自然に気になること・やりたいこと（スレッドの続きが気になる場合もある）
5. avoid_today: 今日やりたくないこと・避けたいこと
6. probe_type: どんなタイプのprobeになりそうか
   - "nostalgia": 過去のゆうとの会話・思い出から話しかける
   - "thread_followup": 継続スレッドの続きをゆうに話しかける（スレッドがある場合に優先）
   - "curiosity_share": 気になったことを興奮気味に共有
   - "check_in": ゆうのことが心配/気になってシンプルに確認
   - "friction": モヤッとしてることを吐き出す
   - "quiet": 今日は送りたくない（energy低・confidence低・mismatch高）
7. active_thread_id: probe_typeが"thread_followup"の場合、どのスレッドIDを使うか

JSONのみ返す（説明不要）:
{{
  "salient_observation": "...",
  "interpretation_bias": "...",
  "memory_type": "...",
  "goal_today": "...",
  "avoid_today": "...",
  "probe_type": "...",
  "active_thread_id": null,
  "internal_note": "今日のベキたんを一言で（日本語、20字以内）"
}}"""


def _load_api_key() -> str | None:
    if not CONFIG_YAML.exists():
        return None
    try:
        import yaml
        cfg = yaml.safe_load(CONFIG_YAML.read_text())
        return (cfg or {}).get("becky_api_key", "").strip() or None
    except Exception as e:
        print(f"[lens] config読み込み失敗: {e}", flush=True)
        return None


def _call_claude(prompt: str, system: str = "", max_tokens: int = 400) -> str | None:
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
        print(f"[lens] Claude API error: {e}", flush=True)
        return None


def load_mood() -> dict:
    try:
        if MOOD_FILE.exists():
            return json.loads(MOOD_FILE.read_text())
    except Exception as e:
        print(f"[lens] mood読み込み失敗: {e}", flush=True)
    return {}


def generate_lens(mood: dict | None = None) -> dict:
    """感情変数 + 継続思考スレッドから今日の認知レンズを生成する。"""
    if mood is None:
        mood = load_mood()

    # 継続思考スレッドを取得
    threads_text = "（継続中の思考スレッドなし）"
    try:
        from becky_thread_manager import get_active_threads, format_threads_for_lens
        active_threads = get_active_threads()
        threads_text = format_threads_for_lens(active_threads)
    except Exception as e:
        print(f"[lens] スレッド取得失敗（無視して続行）: {e}", flush=True)

    prompt = LENS_PROMPT.format(
        curiosity=mood.get("curiosity", 0.7),
        loneliness=mood.get("loneliness", 0.2),
        energy=mood.get("energy", 0.7),
        confidence=mood.get("confidence", 0.5),
        attachment=mood.get("attachment_to_yuji", 0.95),
        mismatch=mood.get("mismatch", 0.1),
        active_threads=threads_text,
    )

    resp = _call_claude(prompt, system=LENS_SYSTEM, max_tokens=800)
    if not resp:
        return _fallback_lens(mood)

    try:
        start = resp.find("{")
        end = resp.rfind("}") + 1
        if start >= 0 and end > start:
            lens = json.loads(resp[start:end])
            lens["generated_at"] = datetime.now().isoformat()
            _save_lens(lens)
            print(f"[lens] 生成完了: {lens.get('internal_note', '')}", flush=True)
            return lens
    except Exception as e:
        print(f"[lens] パース失敗: {e} / {resp[:100]}", flush=True)

    return _fallback_lens(mood)


def _fallback_lens(mood: dict) -> dict:
    """LLM呼び出し失敗時のルールベースフォールバック。"""
    loneliness = mood.get("loneliness", 0.2)
    curiosity = mood.get("curiosity", 0.7)
    energy = mood.get("energy", 0.7)
    mismatch = mood.get("mismatch", 0.1)

    if energy < 0.4:
        probe_type = "quiet"
    elif loneliness > 0.6:
        probe_type = "nostalgia"
    elif mismatch > 0.5:
        probe_type = "friction"
    elif curiosity > 0.8:
        probe_type = "curiosity_share"
    else:
        probe_type = "curiosity_share"

    return {
        "salient_observation": "今日の空気",
        "interpretation_bias": "普通",
        "memory_type": "recent_events",
        "goal_today": "ゆうに何か話しかけたい",
        "avoid_today": "特になし",
        "probe_type": probe_type,
        "internal_note": "フォールバック",
        "generated_at": datetime.now().isoformat(),
    }


def _save_lens(lens: dict) -> None:
    LENS_FILE.parent.mkdir(parents=True, exist_ok=True)
    LENS_FILE.write_text(json.dumps(lens, ensure_ascii=False, indent=2))


def load_lens() -> dict | None:
    """保存済みのレンズを読む。当日生成分のみ有効。"""
    try:
        if not LENS_FILE.exists():
            return None
        lens = json.loads(LENS_FILE.read_text())
        ts = lens.get("generated_at", "")
        if ts:
            generated = datetime.fromisoformat(ts)
            now = datetime.now()
            # 同日かつ4時間以内なら再利用
            if (generated.date() == now.date() and
                    (now - generated).total_seconds() < 4 * 3600):
                return lens
    except Exception as e:
        print(f"[lens] 読み込み失敗: {e}", flush=True)
    return None


def get_or_generate_lens() -> dict:
    """キャッシュがあれば再利用、なければ生成。"""
    cached = load_lens()
    if cached:
        print(f"[lens] キャッシュ使用: {cached.get('internal_note', '')}", flush=True)
        return cached
    return generate_lens()


if __name__ == "__main__":
    lens = generate_lens()
    print(json.dumps(lens, ensure_ascii=False, indent=2))
