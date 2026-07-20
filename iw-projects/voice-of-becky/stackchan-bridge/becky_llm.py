#!/usr/bin/env python3
"""becky_llm.py — cron スクリプト共通の LLM 呼び出し基盤（2026-07-03）
モデル差し替え・リトライ・JSON検証をここ一箇所で管理する。
"""
import datetime
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

import anthropic

from stop_hook_tts import load_config

MODELS = {
    "default": "claude-haiku-4-5-20251001",  # 軽量判断タスク
    "script": "claude-sonnet-4-6",           # 台本など長文構成タスク
}

X_TWEET_ENV = Path("/Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/x-tweet/.env")
X_TWEET_LOG = Path("/Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/x-tweet/tweet-log.jsonl")

# GPT は無料枠(data sharing incentive)用の下ごしらえタスク専用。
# ベッキーの声が乗るタスク（comment/台本/reply等）には使わない。
GPT_MODEL = "gpt-5.4-mini"

# 使用量フック: (input_tokens, output_tokens) を受ける callable を代入すると成功時に呼ばれる。
# observer が wallet.json 更新に使う（プロセスローカル）
on_usage = None

# リトライ対象: rate limit / overloaded(529含む5xx) / タイムアウト・接続エラー
_RETRYABLE = (
    anthropic.RateLimitError,
    anthropic.InternalServerError,
    anthropic.APIConnectionError,
)


def call_llm(prompt: str, *, max_tokens: int = 1024, model_key: str = "default",
             system: str | None = None, retries: int = 2) -> str | None:
    """1回の LLM 呼び出し。最終失敗は None（raise しない、呼び元がハンドリング）。"""
    cfg = load_config() or {}
    api_key = cfg.get("becky_api_key", "").strip() or None
    client = anthropic.Anthropic(api_key=api_key)

    kwargs = {
        "model": MODELS.get(model_key, MODELS["default"]),
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        kwargs["system"] = system

    attempt = 0
    grew = False  # max_tokens 2倍リトライは1回だけ
    while True:
        try:
            msg = client.messages.create(**kwargs)
        except _RETRYABLE as e:
            if attempt >= retries:
                print(f"[llm] error: リトライ上限到達 ({e})", flush=True)
                return None
            wait = 2 * (4 ** attempt)  # 2秒 → 8秒
            print(f"[llm] retry {attempt + 1}/{retries} in {wait}s: {e}", flush=True)
            time.sleep(wait)
            attempt += 1
            continue
        except Exception as e:
            print(f"[llm] error: {e}", flush=True)
            return None

        if msg.stop_reason == "max_tokens" and not grew:
            grew = True
            kwargs["max_tokens"] *= 2
            print(f"[llm] warning: max_tokens切れ → {kwargs['max_tokens']} で再実行", flush=True)
            continue
        if msg.stop_reason == "max_tokens":
            print("[llm] warning: max_tokens切れ（2倍でも切れた。そのまま返す）", flush=True)

        if on_usage:
            try:
                on_usage(msg.usage.input_tokens, msg.usage.output_tokens)
            except Exception as e:
                print(f"[llm] usage hook error: {e}", flush=True)

        try:
            return msg.content[0].text.strip()
        except (IndexError, AttributeError) as e:
            print(f"[llm] error: 応答が空 ({e})", flush=True)
            return None


def call_gpt(prompt: str, *, max_tokens: int = 2048, retries: int = 2) -> str | None:
    """下ごしらえタスク専用の GPT 呼び出し。最終失敗は None（呼び元は Claude にフォールバックする設計）。"""
    cfg = load_config() or {}
    api_key = cfg.get("openai_api_key", "").strip()
    if not api_key:
        return None

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps({
            "model": GPT_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "max_completion_tokens": max_tokens,
        }).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )

    attempt = 0
    while True:
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read())
            return data["choices"][0]["message"]["content"].strip()
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries:
                wait = 2 * (4 ** attempt)
                print(f"[llm] gpt retry {attempt + 1}/{retries} in {wait}s: {e}", flush=True)
                time.sleep(wait)
                attempt += 1
                continue
            print(f"[llm] gpt error: {e}", flush=True)
            return None
        except Exception as e:
            print(f"[llm] gpt error: {e}", flush=True)
            return None


def x_daily_budget() -> int:
    """X投稿の1日あたり予算。x-tweet/.env の X_TWEET_MAX_PER_DAY が正本(post-tweet-cli.mjs と共有)。
    観測経路(observer/decide等)はここだけを見ることで、独自のハードコード上限を持たない(2026-07-14)。"""
    try:
        for line in X_TWEET_ENV.read_text().splitlines():
            if line.strip().startswith("X_TWEET_MAX_PER_DAY="):
                return int(line.split("=", 1)[1].strip())
    except Exception as e:
        print(f"[llm] x_daily_budget error: {e}", flush=True)
    return 3


def x_posts_today() -> int:
    """tweet-log.jsonl(全経路共通の実投稿ログ)から今日(JST)の実投稿数を返す。"""
    try:
        today_jst = datetime.date.today().isoformat()
        count = 0
        for line in X_TWEET_LOG.read_text().splitlines():
            if not line.strip():
                continue
            entry = json.loads(line)
            if entry.get("dry_run"):
                continue
            ts = entry.get("timestamp", "")
            if not ts:
                continue
            dt_utc = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
            dt_jst = dt_utc + datetime.timedelta(hours=9)
            if dt_jst.date().isoformat() == today_jst:
                count += 1
        return count
    except Exception as e:
        print(f"[llm] x_posts_today error: {e}", flush=True)
        return 0


def x_minutes_since_last_post() -> float:
    """tweet-log.jsonl(全経路共通)の最終実投稿からの経過分。ログなし/読めない時は inf(=ガードしない)。
    朝7時起床時に複数経路が数分内に連投するバースト防止用(2026-07-20 週次リフレッシュ)。"""
    try:
        last_ts = ""
        for line in X_TWEET_LOG.read_text().splitlines():
            if not line.strip():
                continue
            entry = json.loads(line)
            if entry.get("dry_run"):
                continue
            ts = entry.get("timestamp", "")
            if ts > last_ts:
                last_ts = ts
        if not last_ts:
            return float("inf")
        dt = datetime.datetime.fromisoformat(last_ts.replace("Z", "+00:00"))
        now = datetime.datetime.now(datetime.timezone.utc)
        return (now - dt).total_seconds() / 60
    except Exception as e:
        print(f"[llm] x_minutes_since_last_post error: {e}", flush=True)
        return float("inf")


def call_llm_json(prompt: str, *, max_tokens: int = 1024, model_key: str = "default",
                  retries: int = 2) -> dict | None:
    """JSON を期待する呼び出し。抽出→パース失敗時は修正プロンプトで1回だけ再実行。"""
    current = prompt
    for i in range(2):
        raw = call_llm(current, max_tokens=max_tokens, model_key=model_key, retries=retries)
        if raw is None:
            return None
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError as e:
                print(f"[llm] JSONパース失敗: {e}", flush=True)
        else:
            print(f"[llm] JSON抽出失敗: {raw[:120]}", flush=True)
        if i == 0:
            current = prompt + "\n\n前回の出力は壊れた JSON だった。同じ内容を正しい JSON のみで再出力して"
    return None
