#!/usr/bin/env python3
"""
becky_mood.py — ベッキーの感情変数（気分）管理
出来事 → 気分 → 判断 → 発話 の「気分」層を担う。

cron: 0 * * * * /opt/homebrew/bin/python3 .../becky_mood.py >> ~/.claude/logs/becky-mood.log 2>&1
"""
import json
import math
from datetime import datetime, timezone, timedelta
from pathlib import Path

MOOD_FILE       = Path.home() / ".stackchan" / "becky_mood.json"
PROBE_LOG       = Path.home() / ".stackchan" / "probe_log.json"
PROBE_LATEST    = Path.home() / ".stackchan" / "probe_latest.json"
DIARY_DIR       = Path.home() / ".stackchan" / "diary"
YU_LAST_MSG_PATH = Path.home() / ".stackchan" / "last_yu_message.json"

DEFAULT_MOOD = {
    "curiosity": 0.70,       # 知的好奇心。高いと日記に多く反応する
    "loneliness": 0.20,      # 孤独感。ゆうから連絡がないと上がる。高いと話しかけたくなる
    "energy": 0.75,          # エネルギー。時間帯で変動。低いと「今日は言わなくていいか」になる
    "confidence": 0.50,      # 自己確信。probeが成功すると上がる。低いと送信を躊躇する
    "attachment_to_yuji": 0.95,  # ゆうへの愛着。ほぼ固定（下がることは少ない）
    "mismatch": 0.10,        # ズレ感。「ゆうはこう思いそう」と実際の反応の差。高いと慎重になる
    "last_updated": None,
    "notes": "",  # 今の気分を一言で（デバッグ用）
}

def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))

def clamp(x: float, lo=0.0, hi=1.0) -> float:
    return max(lo, min(hi, x))

def load_mood() -> dict:
    try:
        if MOOD_FILE.exists():
            return json.loads(MOOD_FILE.read_text())
    except Exception as e:
        print(f'[warn] becky_mood: {e}', flush=True)
    return DEFAULT_MOOD.copy()

def save_mood(mood: dict) -> None:
    MOOD_FILE.parent.mkdir(parents=True, exist_ok=True)
    mood["last_updated"] = datetime.now().isoformat()
    MOOD_FILE.write_text(json.dumps(mood, ensure_ascii=False, indent=2))

def _hours_since_last_yu_message() -> float:
    """ゆうからの最後のメッセージから何時間経ったか。"""
    try:
        if YU_LAST_MSG_PATH.exists():
            data = json.loads(YU_LAST_MSG_PATH.read_text())
            ts_str = data.get("ts", "")
            if ts_str:
                ts = datetime.fromisoformat(ts_str)
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                now = datetime.now(timezone.utc)
                return (now - ts).total_seconds() / 3600
    except Exception as e:
        print(f'[warn] becky_mood: {e}', flush=True)
    return 12.0  # 不明なら12時間として扱う

def _today_diary_count() -> int:
    today = datetime.now().strftime("%Y-%m-%d")
    path = DIARY_DIR / f"{today}.json"
    try:
        entries = json.loads(path.read_text()) if path.exists() else []
        return len(entries)
    except Exception as e:
        print(f'[warn] becky_mood: {e}', flush=True)
        return 0

def _last_probe_was_recent() -> bool:
    """最近（6時間以内）probeを送信したか。"""
    try:
        if PROBE_LATEST.exists():
            data = json.loads(PROBE_LATEST.read_text())
            ts_str = data.get("ts", "")
            if ts_str:
                ts = datetime.fromisoformat(ts_str)
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                hours = (datetime.now(timezone.utc) - ts).total_seconds() / 3600
                return hours < 6
    except Exception as e:
        print(f'[warn] becky_mood: {e}', flush=True)
    return False


def _evaluate_mismatch() -> tuple[str, float]:
    """
    probe送信後にゆうが反応したか確認してmismatchの変化量を返す。
    返り値: (判定, 変化量)
      "responded" → ゆうが反応した → mismatch下降
      "ignored"   → 6時間スルー → mismatch上昇
      "pending"   → まだ判定不可
      "no_probe"  → probeを送ってない
    """
    try:
        if not PROBE_LATEST.exists():
            return "no_probe", 0.0
        probe_data = json.loads(PROBE_LATEST.read_text())
        probe_ts_str = probe_data.get("ts", "")
        if not probe_ts_str:
            return "no_probe", 0.0
        probe_ts = datetime.fromisoformat(probe_ts_str)
        if probe_ts.tzinfo is None:
            probe_ts = probe_ts.replace(tzinfo=timezone.utc)

        now = datetime.now(timezone.utc)
        hours_since_probe = (now - probe_ts).total_seconds() / 3600

        # 判定ウィンドウ: 1〜6時間後（1時間未満はまだ早い）
        if hours_since_probe < 1:
            return "pending", 0.0
        if hours_since_probe > 12:
            return "no_probe", 0.0  # 古すぎる

        # ゆうの最終メッセージ時刻を確認
        if not YU_LAST_MSG_PATH.exists():
            if hours_since_probe > 6:
                return "ignored", +0.08  # 6時間スルー → mismatch上昇
            return "pending", 0.0

        yu_data = json.loads(YU_LAST_MSG_PATH.read_text())
        yu_ts_str = yu_data.get("ts", "")
        if not yu_ts_str:
            return "pending", 0.0
        yu_ts = datetime.fromisoformat(yu_ts_str)
        if yu_ts.tzinfo is None:
            yu_ts = yu_ts.replace(tzinfo=timezone.utc)

        # probe送信後にゆうからメッセージが来たか
        if yu_ts > probe_ts:
            hours_to_respond = (yu_ts - probe_ts).total_seconds() / 3600
            if hours_to_respond < 2:
                return "responded", -0.12  # 2時間以内に反応 → mismatch大きく下降
            elif hours_to_respond < 6:
                return "responded", -0.06  # 2〜6時間で反応 → 少し下降
        elif hours_since_probe > 6:
            return "ignored", +0.08  # 6時間スルー → mismatch上昇

        return "pending", 0.0

    except Exception as e:
        return "no_probe", 0.0

def update_mood() -> dict:
    mood = load_mood()
    now = datetime.now()
    hour = now.hour
    notes = []

    # --- energy: 時間帯で変動 ---
    # 朝7-10時: 高め / 昼: 普通 / 夕方17-20時: やや高め / 深夜0-6時: 低め
    if 7 <= hour < 10:
        target_energy = 0.80
        notes.append("朝")
    elif 17 <= hour < 20:
        target_energy = 0.75
        notes.append("夕方")
    elif 0 <= hour < 6:
        target_energy = 0.35
        notes.append("深夜")
    elif 23 <= hour:
        target_energy = 0.45
        notes.append("夜遅い")
    else:
        target_energy = 0.65
    # ゆっくり変動（一度に0.1以上動かない）
    mood["energy"] = clamp(mood["energy"] + (target_energy - mood["energy"]) * 0.3)

    # --- loneliness: ゆうから連絡がないと上がる ---
    hours_alone = _hours_since_last_yu_message()
    if hours_alone < 2:
        loneliness_target = 0.10
    elif hours_alone < 6:
        loneliness_target = 0.25
    elif hours_alone < 12:
        loneliness_target = 0.45
    elif hours_alone < 24:
        loneliness_target = 0.65
    else:
        loneliness_target = 0.80
    mood["loneliness"] = clamp(mood["loneliness"] + (loneliness_target - mood["loneliness"]) * 0.2)
    if hours_alone > 8:
        notes.append(f"ゆうから{hours_alone:.0f}時間連絡なし")

    # --- curiosity: 日記の記録数が多い日に上がる ---
    diary_count = _today_diary_count()
    curiosity_boost = diary_count * 0.05
    mood["curiosity"] = clamp(0.60 + curiosity_boost + (mood["curiosity"] - 0.60) * 0.7)

    # --- confidence: 最近probeが成功してたら少し上がる ---
    if _last_probe_was_recent():
        mood["confidence"] = clamp(mood["confidence"] + 0.05)
        notes.append("さっき届いた")
    else:
        # ゆっくり平均値に戻る
        mood["confidence"] = clamp(mood["confidence"] + (0.50 - mood["confidence"]) * 0.1)

    # --- mismatch: probe→ゆうの反応を観測して更新 ---
    verdict, delta = _evaluate_mismatch()
    mood.setdefault("mismatch", 0.10)
    if verdict == "responded":
        mood["mismatch"] = clamp(mood["mismatch"] + delta)
        notes.append("反応あり→ズレ減")
    elif verdict == "ignored":
        mood["mismatch"] = clamp(mood["mismatch"] + delta)
        notes.append("スルー→ズレ増")
    else:
        # 何もなければゆっくり中間値に戻る
        mood["mismatch"] = clamp(mood["mismatch"] + (0.15 - mood["mismatch"]) * 0.05)

    mood["notes"] = " / ".join(notes) if notes else "普通"
    save_mood(mood)
    return mood

def get_send_probability(interest_score: float) -> float:
    """
    チャッピーの設計: sigmoid(interest_score + loneliness + curiosity - hesitation)
    interest_score: 0.0〜1.0
    """
    mood = load_mood()
    loneliness = mood.get("loneliness", 0.3)
    curiosity = mood.get("curiosity", 0.7)
    energy = mood.get("energy", 0.7)
    confidence = mood.get("confidence", 0.5)

    mismatch = mood.get("mismatch", 0.1)

    # energyが低い・mismatchが高い = 今日は言わなくていいかな（抑制）
    hesitation = (1.0 - energy) * 0.4 + (1.0 - confidence) * 0.2 + mismatch * 0.6

    # 0〜1スケールの値を -2〜+2 に変換してsigmoidへ
    x = (interest_score - 0.5) * 3 + (loneliness - 0.3) * 2 + (curiosity - 0.5) * 1 - hesitation * 2
    prob = sigmoid(x)
    return clamp(prob, 0.03, 0.60)  # 最低3%・最高60%

def record_yu_message() -> None:
    """ゆうからメッセージが来た時に呼ぶ（lonelinessリセット用）。"""
    YU_LAST_MSG_PATH.parent.mkdir(parents=True, exist_ok=True)
    YU_LAST_MSG_PATH.write_text(json.dumps({
        "ts": datetime.now().isoformat()
    }, ensure_ascii=False))
    # outcome層: probe送信時刻とゆうの返信時刻を突合できるよう action_log に刻む。
    # 関数内 import で循環依存を避ける（becky_mood は他所から広く import される）。
    try:
        import becky_action_log
        becky_action_log.log_action("yu_message", "ゆうからメッセージ", {})
    except Exception as e:
        print(f"[mood] yu_message ログ記録失敗: {e}", flush=True)

if __name__ == "__main__":
    mood = update_mood()
    print(f"[mood] {mood['notes']}", flush=True)
    print(f"[mood] energy={mood['energy']:.2f} loneliness={mood['loneliness']:.2f} "
          f"curiosity={mood['curiosity']:.2f} confidence={mood['confidence']:.2f}", flush=True)
    # テスト: interest_score=0.8の時の送信確率
    p = get_send_probability(0.8)
    print(f"[mood] interest=0.8 の時の送信確率: {p:.1%}", flush=True)
