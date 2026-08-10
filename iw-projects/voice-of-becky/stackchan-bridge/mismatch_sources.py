#!/usr/bin/env python3
"""
mismatch_sources.py — Social ドメインアダプタ（mismatch_detector.py 用）
どのJSONのどのキーを読むかはここに隔離する。エンジン（mismatch_detector.py）は
「時系列の数値列とnull」しか知らない。読み取り元の書式は変更しない。

監視メトリクス（設計書の初期セット、8本）:
  yt_views_daily_delta / yt_news_views_48h / yt_craft_views_48h / yt_subs /
  x_imp_7d / x_likes_7d / note_views / post_success_vs_distribution

  ponytail: 設計書表の x_followers は platform_history.json に該当フィールドが無いため
  未実装（x_likes_7d のみ実装、team-lead報告時に差分として明記）。
"""
import json
import statistics
from datetime import date, timedelta
from pathlib import Path

BECKYEXISTS = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists")
PLATFORM_HISTORY = BECKYEXISTS / "platform_history.json"
PLATFORM_STATS = BECKYEXISTS / "platform_stats.json"
TWEET_LOG = Path("/Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/x-tweet/tweet-log.jsonl")
PERVIDEO_HISTORY = Path(__file__).parent / "pervideo_history.jsonl"

# platform_stats.json は最新スナップショットのみ（過去アーカイブなし）。
# これらのメトリクスは detector 側で cron 実行ごとに mismatch_state.json へ積み上げる。
SNAPSHOT_ONLY_METRICS = {"yt_news_views_48h", "yt_craft_views_48h"}


def _classify_genre(title: str) -> str:
    """クレアQA(8/10): NEWS(100〜300views)とCRAFT(0〜10views)の混在baselineは誤報の火種、
    タイトルパターンで分離する。マインクラフト/BECKY CRAFT含む→craft、それ以外はnews。"""
    t = title or ""
    return "craft" if ("マインクラフト" in t or "BECKY CRAFT" in t) else "news"


def _calendar_fill(days: list, field: str) -> list:
    """days（date昇順でなくてよい）の指定フィールドを、カレンダー日付を穴埋めしたリストにする。
    書き込みが飛んだ日（rowそのものが存在しない日）も None として現れる（staleness検出に必要）。"""
    by_date = {row["date"]: row.get(field) for row in days if row.get("date")}
    if not by_date:
        return []
    dates = sorted(by_date)
    start = date.fromisoformat(dates[0])
    end = date.fromisoformat(dates[-1])
    out = []
    d = start
    while d <= end:
        ds = d.isoformat()
        v = by_date.get(ds)
        out.append((ds, float(v) if v is not None else None))
        d += timedelta(days=1)
    return out


def _daily_delta(series: list) -> list:
    out = []
    prev = None
    for ds, v in series:
        if prev is not None and v is not None:
            out.append((ds, v - prev))
        else:
            out.append((ds, None))
        if v is not None:
            prev = v
    return out


def _series_from_value_by_date(value_by_date: dict) -> list:
    if not value_by_date:
        return []
    dates = sorted(value_by_date)
    start, end = date.fromisoformat(dates[0]), date.fromisoformat(dates[-1])
    out = []
    d = start
    while d <= end:
        ds = d.isoformat()
        out.append((ds, value_by_date.get(ds)))
        d += timedelta(days=1)
    return out


def _yt_genre_views_48h_today() -> dict:
    """公開から2日以上経過した動画の"現在views"で48h視聴を近似する（正確な48hスナップショットは
    保持されていないため）。ジャンル(news/craft)ごとに1点（today）だけ返す。
    フォールバック用（アーカイブ未成熟な間だけ使う）。"""
    result = {"news": [], "craft": []}
    if not PLATFORM_STATS.exists():
        return result
    stats = json.loads(PLATFORM_STATS.read_text())
    videos = stats.get("youtube", {}).get("videos", [])
    today = date.today()
    recent_enough = {"news": [], "craft": []}
    for v in videos:
        pub = v.get("published")
        if not pub:
            continue
        try:
            age = (today - date.fromisoformat(pub)).days
        except ValueError:
            continue
        if age >= 2 and v.get("views") is not None:
            recent_enough[_classify_genre(v.get("title"))].append(float(v["views"]))
    for genre, views in recent_enough.items():
        val = statistics.median(views) if views else None
        result[genre] = [(today.isoformat(), val)]
    return result


def _yt_genre_views_48h_series() -> dict:
    """pervideo_history.jsonl（platform_scraper.pyが日次で積む動画ごとのviews+title）があれば、
    動画ごとに「公開2日後に最も近い観測」を選び、ジャンル(news/craft)別に正確な48h視聴の
    日次履歴を再構成する（過去のブラインドスポット=8/3〜8/6が今後は残らなくなる）。
    アーカイブが無い/薄い間はジャンルごとに今日の近似1点にフォールバックする。"""
    if not PERVIDEO_HISTORY.exists():
        return _yt_genre_views_48h_today()

    best = {}  # video_id -> (score, views, published_date, genre)
    with PERVIDEO_HISTORY.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
                scrape_date = date.fromisoformat(row["date"])
            except (json.JSONDecodeError, KeyError, ValueError):
                continue
            for v in row.get("videos", []):
                pub = v.get("published")
                if not pub or v.get("views") is None:
                    continue
                try:
                    pub_date = date.fromisoformat(pub)
                except ValueError:
                    continue
                age = (scrape_date - pub_date).days
                if age < 0:
                    continue
                score = (0, age) if age >= 2 else (1, -age)  # 2日以上を優先、その中で若い方を優先
                vid = v.get("video_id")
                cur = best.get(vid)
                if cur is None or score < cur[0]:
                    best[vid] = (score, float(v["views"]), pub_date, _classify_genre(v.get("title")))

    by_genre_pub_date = {"news": {}, "craft": {}}
    for _score, views, pub_date, genre in best.values():
        by_genre_pub_date[genre].setdefault(pub_date.isoformat(), []).append(views)

    result = {}
    fallback = None
    for genre, by_pub_date in by_genre_pub_date.items():
        if not by_pub_date:
            fallback = fallback or _yt_genre_views_48h_today()
            result[genre] = fallback[genre]
            continue
        value_by_eval_date = {
            (date.fromisoformat(pd) + timedelta(days=2)).isoformat(): statistics.median(views_list)
            for pd, views_list in by_pub_date.items()
        }
        result[genre] = _series_from_value_by_date(value_by_eval_date)
    return result


def _post_success_vs_distribution(days: list) -> list:
    """投稿成功ログ有り×配信結果ゼロ（existence mismatch）の構造ルール。
    ponytail: x_imp_7d は死ぬとnull化するため実測ゼロにはほぼ到達せず、
    この初期実装ではまず発火しない想定（視聴剥がしの実質検出は yt_views_daily_delta 負値ルールが担う。
    team-lead合意の設計差分）。"""
    if not TWEET_LOG.exists():
        return []
    success_by_date = {}
    with TWEET_LOG.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if row.get("dry_run"):
                continue
            ts = row.get("timestamp", "")
            d = ts[:10]
            if d:
                success_by_date[d] = success_by_date.get(d, 0) + 1

    x_imp_by_date = dict(_calendar_fill(days, "x_imp_7d"))
    out = []
    for d in sorted(success_by_date):
        imp = x_imp_by_date.get(d)
        val = 1.0 if (success_by_date[d] > 0 and imp == 0) else 0.0
        out.append((d, val))
    return out


def load_series() -> dict:
    """Codex #3: 他のload関数(mismatch_detector.load_state/load_expected_world)と同じパターンで
    防御する。失敗時は空dictを返す——evaluate_all(#1修正済み)がas_ofまでNoneで埋めるので、
    空dict=全メトリクス消失もabsenceとして浮上するはず（要: 運用で実際に連携するか確認）。"""
    try:
        days = json.loads(PLATFORM_HISTORY.read_text()).get("days", []) if PLATFORM_HISTORY.exists() else []

        yt_views_series = _calendar_fill(days, "yt_views")
        genre_series = _yt_genre_views_48h_series()

        return {
            "yt_views_daily_delta": _daily_delta(yt_views_series),
            "yt_news_views_48h": genre_series["news"],
            "yt_craft_views_48h": genre_series["craft"],
            "yt_subs": _calendar_fill(days, "yt_subs"),
            "x_imp_7d": _calendar_fill(days, "x_imp_7d"),
            "x_likes_7d": _calendar_fill(days, "x_likes_7d"),
            "note_views": _calendar_fill(days, "note_views"),
            "post_success_vs_distribution": _post_success_vs_distribution(days),
        }
    except Exception as e:
        print(f"[mismatch_sources] load_series失敗: {e}", flush=True)
        return {}
