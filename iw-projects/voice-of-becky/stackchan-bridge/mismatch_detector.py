#!/usr/bin/env python3
"""
mismatch_detector.py — Reality Mismatch Detection の汎用エンジン
設計書: /Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/docs/mismatch-detection-design.md
発端: stackchan-bridge/incidents/2026-08-05_distribution_zero.md

ドメイン非依存。知っているのは「時系列の数値列とnull」だけ。
どのJSONのどのキーを読むかは mismatch_sources.py（アダプタ）に隔離。

cron: 50 7 * * * /opt/homebrew/bin/python3 .../mismatch_detector.py >> ~/.claude/logs/becky-mismatch.log 2>&1
"""
import fnmatch
import json
import statistics
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

# 同ディレクトリの becky_probe / becky_mood を cwd に依らず import できるようにする
sys.path.insert(0, str(Path(__file__).parent))

HERE = Path(__file__).parent
STATE_PATH = HERE / "mismatch_state.json"
EXPECTED_WORLD_PATH = HERE / "expected_world.json"
INCIDENTS_DIR = HERE / "incidents"
REPO_ROOT = Path("/Volumes/SSD2TB/interventionworks")
REPORTS_PATH = REPO_ROOT / "iw-projects" / "beckyexists" / "reports.json"

_LEVELS = ["INFO", "WARNING", "HIGH", "CRITICAL"]
# ponytail: 1桁の整数カウント(likesなど)は%偏差やゼロ連続の閾値が常に発火してしまうので、
# baseline中央値がこの規模を下回るメトリクスには value-collapse 系ルールを適用しない。
MEANINGFUL_SCALE = 10


def _severity(level: str) -> int:
    return _LEVELS.index(level)


# ---------------------------------------------------------------- state / config

def load_state() -> dict:
    if STATE_PATH.exists():
        try:
            return json.loads(STATE_PATH.read_text())
        except Exception as e:
            print(f"[mismatch] state読み込み失敗: {e}", flush=True)
    return {}


def save_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=1))


def load_expected_world() -> dict:
    if EXPECTED_WORLD_PATH.exists():
        try:
            return json.loads(EXPECTED_WORLD_PATH.read_text())
        except Exception as e:
            print(f"[mismatch] expected_world読み込み失敗: {e}", flush=True)
    return {"contexts": []}


# ---------------------------------------------------------------- baseline / evaluation

def _median_mad(values: list) -> tuple:
    if not values:
        return None, None
    med = statistics.median(values)
    mad = statistics.median([abs(v - med) for v in values])
    return med, mad


def _anomaly(metric, mtype, level, ts, value, note="", expected=None, median=None, streak=None) -> dict:
    d = {"metric": metric, "type": mtype, "level": level, "ts": ts, "value": value, "note": note}
    if expected is not None:
        d["expected"] = expected
    if median is not None:
        d["median"] = median
    if streak is not None:
        d["streak"] = streak
    return d


def evaluate_series(series: list, metric_name: str) -> dict | None:
    """series: 昇順 [(date_str, value|None), ...]。最後の1点（today）に対する anomaly を返す。"""
    if not series:
        return None
    values = [v for _, v in series]
    today_ts, today_val = series[-1]
    history_vals = values[:-1]

    # --- absence（null連続） ---
    null_streak = 0
    for v in reversed(values):
        if v is None:
            null_streak += 1
        else:
            break

    if today_val is None:
        if null_streak >= 7:
            return _anomaly(metric_name, "absence", "HIGH", today_ts, None, streak=null_streak,
                             note=f"null連続{null_streak}日、計測死亡")
        if null_streak >= 3:
            return _anomaly(metric_name, "absence", "WARNING", today_ts, None, streak=null_streak,
                             note=f"null連続{null_streak}日、計測死亡の疑い")
        return None  # 1〜2日はまだ静観

    # trailing 14日 = カレンダー14日以内の既知値（design通り"日数"であり"直近14個の非null点"ではない。
    # 直近の非null点方式だと欠損が多いメトリクスで何ヶ月も前の値まで拾ってしまい baseline が汚染される）
    cutoff = (date.fromisoformat(today_ts) - timedelta(days=14)).isoformat()
    trailing14 = [v for d, v in series[:-1] if d >= cutoff and v is not None]
    median, mad = _median_mad(trailing14)
    low_confidence = len(trailing14) < 5  # Codex #2: 全履歴ではなく直近14日窓の既知点数で見る

    candidates = []  # (level, type, note)
    lo = hi = None
    if median is not None:
        mad_floor = max(mad, abs(median) * 0.05, 1.0)
        # ponytail(Codex #9地雷): 0フロアは負値metric(yt_views_daily_deltaの負側等)では
        # lo>hi反転を起こしうる（例: median=-5,mad_floor=1→lo=max(0,-8)=0, hi=-5+3=-2、lo>hi）。
        # 現行metricは全て非負を主対象にしているため実害は無いが、将来負中心のmetricを追加する時は要注意。
        lo = max(0.0, median - 3 * mad_floor)
        hi = median + 3 * mad_floor

    # --- existence/value collapse: ゼロ連続2日（"意味のある規模"のメトリクスに限る） ---
    # ponytail: 設計書は「baseline中央値>0」だが、x_likes_7d(1桁の"いいね"数)のような
    # 元々ゼロ近傍で揺れる整数カウントは、中央値>0でも0が日常的に出て誤報になる
    # （実データ検証で発覚）。%偏差(下記の急落/急騰/range判定)も同じ理由で分母が小さすぎて
    # 常時"-90%超"化する。MEANINGFUL_SCALE未満の中央値では両方をスキップし、
    # 桁の大きいメトリクス(views等)だけ「ゼロ/急落=本物の崩壊」として扱う。
    zero_streak = 0
    for v in reversed(values):
        # Codex #4: nullは「わからない」であってゼロ継続の証拠ではない。nullに当たったら
        # streakを打ち切る（以前はnullを読み飛ばして途切れたゼロ期間を誤って繋げていた）。
        if v is None:
            break
        # ponytail: 偶数個のvideoのmedianは0.5等の"ほぼゼロ"になりうる(実データ検証で発覚、
        # 例: [0,1]→0.5)。厳密な==0ではなく0<=v<1を「実質ゼロ」として扱う
        # (負値はyt_views_daily_deltaの「視聴剥がし」等、別の意味を持つので除外)
        if 0 <= v < 1:
            zero_streak += 1
        else:
            break
    meaningful_scale = median is not None and median >= MEANINGFUL_SCALE
    # Codex #5: yt_views_daily_deltaは下の%偏差判定と同じ理由(delta指標、水準ではない)で
    # zero_streak CRITICALルールも対象外にする(コメントの設計意図と実装が矛盾していた)
    if meaningful_scale and metric_name != "yt_views_daily_delta" and zero_streak >= 2:
        candidates.append(("CRITICAL", "value",
                            f"ゼロ連続{zero_streak}日、baseline中央値{median:.1f}"))

    # --- メトリクス固有ルール: 視聴剥がし（負値は即WARNING、規模に関係なく常時） ---
    if metric_name == "yt_views_daily_delta" and today_val < 0:
        candidates.append(("WARNING", "value", "視聴剥がし(前日比マイナス)"))

    # ponytail: yt_views_daily_delta は「累積カウンタの日次差分」で、水準(level)ではなく
    # 変化量(delta)。日々の変化量自体が0近傍で符号反転するのは正常であり、中央値に対する
    # %偏差は分母が小さすぎて常時-90%超を誤検知する(実データ検証で発覚)。上の専用ルール
    # (負値=WARNING)だけで足りるので、delta系メトリクスは汎用偏差判定をスキップする。
    if meaningful_scale and metric_name != "yt_views_daily_delta":
        deviation = (today_val - median) / max(abs(median), 1.0)
        yesterday_val = history_vals[-1] if history_vals else None

        if deviation <= -0.9:
            candidates.append(("HIGH", "value", f"baseline比{deviation * 100:.0f}%の急落"))
        if deviation >= 9.0:
            candidates.append(("WARNING", "value",
                                f"+{deviation * 100:.0f}%の急騰、品質シグナル監視強化"))
        out_today = today_val < lo or today_val > hi
        out_yesterday = yesterday_val is not None and (yesterday_val < lo or yesterday_val > hi)
        if out_today and out_yesterday:
            candidates.append(("WARNING", "value", "range外2日連続"))
        elif out_today:
            candidates.append(("INFO", "value", "range外(単発)"))

    if not candidates:
        return None

    level, mtype, note = max(candidates, key=lambda c: _severity(c[0]))
    if low_confidence and _severity(level) > _severity("INFO"):
        # ponytail: 履歴5日未満はconfidence low、WARNING以上は出さず握りつぶしてINFOへ
        level, note = "INFO", note + " [履歴5日未満、confidence low]"

    return _anomaly(metric_name, mtype, level, today_ts, today_val,
                     expected=[lo, hi] if median is not None else None,
                     median=median, note=note)


def _apply_context(anomaly: dict, expected_world: dict, as_of: str) -> dict:
    # Codex #7（意図的仕様、誤りではない）: WARNINGは降格しない。pauseは「投稿の停止」であって
    # 「計測の停止」ではない。pause中でも計測死亡(absence WARNING)は知りたい——投稿を止めていても
    # 計測パイプライン自体は生きているべきなので、その死は依然としてmismatchとして扱う。
    # Codex #8（地雷標識）: 複数contextが同じmetricにマッチする場合は最初にマッチしたものが勝つ
    # (break で以降を評価しない)。expected_world.jsonのcontexts配列の並び順に依存する。
    # 現状は重複スコープを書かない運用で回避しているが、将来重なるscopeを書く時は要注意。
    for ctx in expected_world.get("contexts", []):
        if ctx.get("expect") != "paused":
            continue
        if ctx.get("until", "") < as_of:
            continue  # 期限切れは無効（_check_expired_contexts側で別途拾う）
        if fnmatch.fnmatch(anomaly["metric"], ctx.get("scope", "")):
            if _severity(anomaly["level"]) >= _severity("HIGH"):
                anomaly["level"] = "INFO"
                anomaly["note"] += f" [pausedスコープ中により降格: {ctx.get('note', '')}]"
            break
    return anomaly


def _check_expired_contexts(expected_world: dict, as_of: str, state: dict) -> list:
    out = []
    warned = state.setdefault("expired_contexts_warned", [])
    for ctx in expected_world.get("contexts", []):
        if ctx.get("until", "") >= as_of:
            continue
        key = f"{ctx.get('scope')}::{ctx.get('until')}"
        if key in warned:
            continue
        warned.append(key)
        out.append(_anomaly(f"context:{ctx.get('scope')}", "existence", "WARNING", as_of, None,
                             note=f"期限切れの期待: {ctx.get('note', '')} (until {ctx.get('until')})"))
    return out


def _extend_to(series: list, as_of: str) -> list:
    """Codex #1（CRITICAL）: series の末尾から as_of までのカレンダー日をNoneで埋める。
    これが無いと、スクレイパーが死んで新しい行が来なくなった場合に series の最後の日付が
    止まったまま=「今日のデータ点が無い」としてevaluate_allがそのmetricを黙って評価スキップし
    続け、永久に沈黙する（発端事件でmismatch検出器自身が同じ穴を持っていたら本末転倒）。
    as_of（実行日）まで強制的に伸ばし、欠けている日はNoneにしてabsenceロジックに乗せる。"""
    if not series:
        return series
    last_date = date.fromisoformat(series[-1][0])
    end = date.fromisoformat(as_of)
    if last_date >= end:
        return series
    out = list(series)
    d = last_date + timedelta(days=1)
    while d <= end:
        out.append((d.isoformat(), None))
        d += timedelta(days=1)
    return out


def evaluate_all(series_by_metric: dict, as_of: str, expected_world: dict, state: dict) -> list:
    anomalies = []
    for metric, series in series_by_metric.items():
        truncated = [(d, v) for d, v in series if d <= as_of]
        truncated = _extend_to(truncated, as_of)
        if not truncated or truncated[-1][0] != as_of:
            continue  # このmetricがまだ一度も観測されていない（seriesが最初から空）
        anomaly = evaluate_series(truncated, metric)
        if anomaly:
            anomalies.append(_apply_context(anomaly, expected_world, as_of))
    anomalies.extend(_check_expired_contexts(expected_world, as_of, state))
    return anomalies


# ---------------------------------------------------------------- snapshot-only metric の積み上げ

def _merge_accumulated(state: dict, metric: str, fresh_points: list) -> list:
    """platform_stats.json はスナップショットのみ（過去アーカイブなし）。
    cron実行ごとにmismatch_state.jsonへ積み上げて、日次履歴を自作する。"""
    acc = state.setdefault("series_cache", {}).setdefault(metric, {})
    for ds, v in fresh_points:
        acc[ds] = v
    cutoff = (date.today() - timedelta(days=60)).isoformat()
    for ds in [k for k in acc if k < cutoff]:
        del acc[ds]
    return sorted(acc.items())


# ---------------------------------------------------------------- action layer

def _should_notify(m_state: dict, level: str, now: datetime) -> bool:
    if level == "INFO":
        return False
    if m_state.get("level") != level:
        return True  # レベル変化（エスカレーション含む）は必ず通知
    last = m_state.get("last_notified_at")
    if not last:
        return True
    try:
        last_dt = datetime.fromisoformat(last)
    except Exception:
        return True
    return (now - last_dt) >= timedelta(hours=48)


def _format_telegram(anomaly: dict) -> str:
    icon = {"HIGH": "⚠️", "CRITICAL": "\U0001f6a8"}.get(anomaly["level"], "❓")
    return f"{icon} [Mismatch Detection] {anomaly['level']}: {anomaly['metric']}\n{anomaly.get('note', '')}"


def _append_report_card(anomaly: dict) -> None:
    if REPORTS_PATH.exists():
        data = json.loads(REPORTS_PATH.read_text())
    else:
        data = {"reports": [], "updated_at": None}
    now_iso = datetime.now().isoformat(timespec="seconds")
    data.setdefault("reports", []).insert(0, {
        "ts": now_iso,
        "kind": "mismatch",
        "title": f"[{anomaly['level']}] {anomaly['metric']}",
        "body": anomaly.get("note", ""),
    })
    data["updated_at"] = now_iso
    REPORTS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=1))


def _bump_mismatch_mood() -> None:
    import becky_mood as bm
    mood = bm.load_mood()
    mood["mismatch"] = bm.clamp(mood.get("mismatch", 0.1) + 0.2)
    mood["notes"] = "CRITICAL mismatch検知、ザワついてる"
    bm.save_mood(mood)


def _recent_git_log(n: int = 5) -> str:
    try:
        out = subprocess.run(
            ["git", "log", f"-{n}", "--oneline"],
            cwd=REPO_ROOT, capture_output=True, text=True, timeout=10,
        )
        return out.stdout.strip()
    except Exception as e:
        return f"(git log取得失敗: {e})"


def _search_known_incidents(metric: str) -> str:
    index_path = INCIDENTS_DIR / "index.jsonl"
    if not index_path.exists():
        return ""
    hits = []
    for line in index_path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if metric in (row.get("metrics") or []) or metric in json.dumps(row, ensure_ascii=False):
            hits.append(f"- {row.get('date')}: {row.get('pattern', '')} → {row.get('root_cause', '')} "
                        f"/ lesson: {row.get('lesson', '')}")
    return "\n".join(hits)


def _write_incident_skeleton(anomaly: dict, series_by_metric: dict) -> Path:
    metric = anomaly["metric"]
    date_str = anomaly["ts"]
    INCIDENTS_DIR.mkdir(parents=True, exist_ok=True)
    path = INCIDENTS_DIR / f"{date_str}_{metric}.md"
    if path.exists():
        return path
    recent14 = [f"{d}: {v}" for d, v in series_by_metric.get(metric, [])[-14:]]
    text = f"""# Incident {date_str}: {metric}

> Mismatch Detection 自動生成スケルトン（CRITICAL発火）。
> ponytail: `claude -p` による Investigation Loop 自動起動は今回未実装（設計書PHASE5との差分）。
> Telegram通知 + このスケルトンまでが自動、続きは次のセッション/人間が埋める。

## OBSERVE

- metric: `{metric}`
- level: CRITICAL
- value: {anomaly.get('value')}
- streak: {anomaly.get('streak')}
- note: {anomaly.get('note', '')}

### 直近14日
{chr(10).join(recent14) or '(データなし)'}

### 直近5commit
{_recent_git_log(5) or '(取得失敗)'}

### 既知の類似インシデント（incidents/index.jsonl）
{_search_known_incidents(metric) or '(類似ケースなし)'}

## HYPOTHESES

- **H0（必須検討・最初に潰すこと）**: 私の期待の方が間違っている
  （baselineが古い / 世界が構造的に変わった / 期待の立て方の誤り）。
  Reality を直すだけでなく Expected を修正して閉じるのも正規の解決。
- (他の仮説は次のセッションで追記)

## DIAGNOSE / INVESTIGATE / CHALLENGE / UPDATE / NEXT ACTION

(未着手 — 次のセッションで埋める)
"""
    path.write_text(text)
    return path


def _update_attention(state: dict, anomalies: list, as_of: str) -> list:
    """CRITICAL/HIGHを『investigation対象として浮上している』リストとして常時反映する
    （48h通知抑制とは無関係、状態そのもの）。解消したらここから消える。"""
    attention = state.setdefault("attention", [])
    active = {a["metric"]: a["level"] for a in anomalies if _severity(a["level"]) >= _severity("HIGH")}
    attention[:] = [e for e in attention if e["metric"] in active]
    existing = {e["metric"]: e for e in attention}
    for metric, level in active.items():
        if metric in existing:
            existing[metric]["level"] = level
        else:
            attention.append({"metric": metric, "level": level, "since": as_of, "incident_file": None})
    return attention


def run_actions(anomalies: list, series_by_metric: dict, state: dict, now: datetime,
                 dry_run: bool = False) -> list:
    attention = _update_attention(state, anomalies, now.date().isoformat())

    # Codex #6: 異常が無かったmetricの m_state["level"] を "OK" にリセットする。
    # これが無いと、CRITICALから回復したmetricが再びCRITICALになった時、stale状態が
    # 同一レベル継続と誤認されて48h抑制がかかる（回復イベントが見えないまま次の悪化が握り潰される）。
    active_metrics = {a["metric"] for a in anomalies}
    for metric in series_by_metric:
        if metric not in active_metrics:
            m_state = state.setdefault("metrics", {}).setdefault(metric, {})
            if m_state.get("level") != "OK":
                m_state["level"] = "OK"

    for a in anomalies:
        metric, level = a["metric"], a["level"]
        m_state = state.setdefault("metrics", {}).setdefault(metric, {})
        notify = _should_notify(m_state, level, now)
        a["notified"] = notify
        if notify:
            if level == "WARNING":
                if not dry_run:
                    _append_report_card(a)
            elif level == "HIGH":
                if not dry_run:
                    from becky_probe import send_telegram
                    send_telegram(_format_telegram(a))
            elif level == "CRITICAL":
                if not dry_run:
                    from becky_probe import send_telegram
                    send_telegram(_format_telegram(a))
                    _bump_mismatch_mood()
                if m_state.get("last_incident_date") != a["ts"]:
                    if not dry_run:
                        skeleton_path = _write_incident_skeleton(a, series_by_metric)
                        for e in attention:
                            if e["metric"] == metric:
                                e["incident_file"] = str(skeleton_path)
                    m_state["last_incident_date"] = a["ts"]
            m_state["last_notified_at"] = now.isoformat()
        m_state["level"] = level
    return anomalies


# ---------------------------------------------------------------- main

def main(dry_run: bool = False) -> list:
    import mismatch_sources as sources
    state = load_state()
    raw = sources.load_series()

    if raw:
        last_seen = state.setdefault("last_seen_date", {})
        for metric, points in raw.items():
            if points:
                last_seen[metric] = points[-1][0]
    else:
        # Codex #3連携: load_series()が完全失敗(空dict)すると、metric名自体が1つも無くなり
        # evaluate_all(#1修正)が空振りする。前回までに観測済みのmetric名から
        # 値None・日付=last_seenのスタブ点を作って渡し、absence検出を継続させる。
        print("[mismatch] sources.load_series()が空dict(完全失敗) — "
              "既知metricsのスタブでabsence検出を継続", flush=True)
        raw = {m: [(d, None)] for m, d in state.get("last_seen_date", {}).items()}

    series = {}
    for metric, points in raw.items():
        if metric in sources.SNAPSHOT_ONLY_METRICS:
            series[metric] = _merge_accumulated(state, metric, points)
        else:
            series[metric] = points

    # Codex #1: as_ofはデータの最終日ではなく実行日そのもの（jst_today）を使う。
    # データ側の最終日をas_ofにすると、scraperが死んで新しい行が来なくなった時に
    # as_ofもそこで一緒に止まってしまい「今日のデータが無い」が永久に検出できない。
    from becky_llm import jst_today
    as_of = jst_today()

    expected_world = load_expected_world()
    anomalies = evaluate_all(series, as_of, expected_world, state)
    now = datetime.now()
    run_actions(anomalies, series, state, now, dry_run=dry_run)
    if not dry_run:
        save_state(state)
    return anomalies


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    try:
        result = main(dry_run=dry)
    except Exception as e:
        # Lesson 2の自己適用: 検知システム自身の死亡は最優先で知るべき（計測の死は本体の死より先に）
        print(f"[mismatch] FATAL: {e}", flush=True)
        try:
            from becky_probe import send_telegram
            send_telegram(f"\U0001f6a8 [Mismatch Detection] mismatch detector自身が死んだ: {e}")
        except Exception as notify_err:
            print(f"[mismatch] 死亡通知も失敗: {notify_err}", flush=True)
        sys.exit(1)
    if not result:
        print("[mismatch] anomaly なし", flush=True)
    for a in result:
        print(f"[{a['level']}] {a['metric']}: {a.get('note', '')}", flush=True)
