#!/usr/bin/env python3
"""
platform_scraper.py — Gemini Chrome（CDP :9223）経由で各ダッシュボードをスクレイプ

Usage:
    python3 platform_scraper.py

依存: pip install pychrome
出力: iw-projects/beckyexists/platform_stats.json

タブは1つだけ開いて使い回す（毎回開閉するとブラウザがアクティブになるため）
"""
import json
import os
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import pychrome

# ponytail: タブを閉じる際に pychrome の _recv_loop が閉じたソケットから読もうとして
# 無害な例外を吐く（処理自体は完了済み）。cron_status の直近ログ判定が誤検知するので黙らせる
_default_excepthook = threading.excepthook


def _quiet_pychrome_recv_loop(args):
    if "_recv_loop" in (args.thread.name if args.thread else ""):
        return
    _default_excepthook(args)


threading.excepthook = _quiet_pychrome_recv_loop

CDP_URL = "http://localhost:9223"
OUTPUT = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists/platform_stats.json")
HISTORY_OUTPUT = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists/platform_history.json")
YT_CHANNEL_ID = "UCFvpdUWDpmSLTTbv6kiIfNQ"  # @voice_of_becky


def _append_history(stats: dict) -> None:
    """日次スナップショットを platform_history.json に積む（前日/週差分表示用、同日上書き・90日保持）。"""
    from datetime import timedelta
    try:
        jst_today = (datetime.now(timezone.utc) + timedelta(hours=9)).date().isoformat()
        x = stats.get("x_analytics", {}) or {}
        yt = stats.get("youtube", {}) or {}
        note = stats.get("note", {}) or {}
        kdp = stats.get("kdp", {}) or {}
        # 累積・ローリング系は 0 ≒ スクレイプ失敗（note PVが0に戻ることはない）→ 欠測(None)扱い
        nz = lambda v: v if v else None
        entry = {
            "date": jst_today,
            "x_imp_7d": nz(x.get("total_impressions")),
            "x_likes_7d": x.get("total_likes"),
            "yt_subs": nz(yt.get("subscribers")),
            "yt_views": nz(yt.get("total_views")),
            "note_views": nz(note.get("total_views")),
            "note_likes": note.get("total_likes"),
            "kdp_orders": kdp.get("orders_this_month"),
            "kdp_kenp": kdp.get("kenp_this_month"),
        }
        try:
            days = json.loads(HISTORY_OUTPUT.read_text()).get("days", [])
        except Exception:
            days = []
        days = [d for d in days if d.get("date") != jst_today]
        days.append(entry)
        days = sorted(days, key=lambda d: d["date"])[-90:]
        HISTORY_OUTPUT.write_text(json.dumps({"days": days}, ensure_ascii=False, indent=1))
        print(f"[scraper] history 追記: {jst_today}（{len(days)}日分）", flush=True)
    except Exception as e:
        print(f"[scraper] history 追記失敗: {e}", flush=True)


def js(tab: pychrome.Tab, code: str):
    result = tab.Runtime.evaluate(expression=code)
    return result["result"].get("value")


def navigate(tab: pychrome.Tab, url: str, wait: float = 2.5) -> None:
    tab.Page.navigate(url=url)
    time.sleep(wait)


# ── Claude Platform ──────────────────────────────────────────────────────────

def scrape_claude_platform(tab: pychrome.Tab) -> dict:
    navigate(tab, "https://platform.claude.com/dashboard", 3)
    # ponytail: cold load bounces /dashboard -> /login -> (auth) -> /dashboard.
    # 3s の固定待ちでは redirect 未解決のまま login と誤判定するレースがあるので
    # login URL でなくなるまで最大10s ポーリングして dashboard 確定を待つ
    for _ in range(7):
        if not re.search(r'login|signin', js(tab, "location.href") or ""):
            break
        time.sleep(1)
    raw = js(tab, r"""
(function() {
  var dollar = Array.from(document.querySelectorAll('*'))
    .filter(function(el){ return el.children.length === 0; })
    .map(function(el){ return el.textContent.trim(); })
    .filter(function(t){ return /^\$[0-9]+\.[0-9]+$/.test(t); });
  var costEl = document.querySelector('a[href="/cost"]');
  var costText = costEl ? costEl.textContent : '';
  var m = costText.match(/\$([0-9.]+)/);
  return JSON.stringify({
    credit: dollar[0] || null,
    monthly: m ? m[0] : null
  });
})()
""")
    d = json.loads(raw) if raw else {}
    return {
        "credit_remaining": float((d.get("credit") or "$0").replace("$", "")),
        "monthly_cost_usd": float((d.get("monthly") or "$0").replace("$", "")),
    }


# ── note stats ───────────────────────────────────────────────────────────────

def scrape_note(tab: pychrome.Tab) -> dict:
    navigate(tab, "https://note.com/sitesettings/stats", 3)
    raw = js(tab, r"""
(function() {
  var lines = document.body.innerText
    .split('\n')
    .map(function(l){ return l.trim(); })
    .filter(function(l){ return l.length > 0 && l.length < 200; });

  var views = 0, likes = 0, vf = false, lf = false;
  for (var i = 0; i < lines.length; i++) {
    if (!vf && lines[i] === '全体ビュー' && i > 0) {
      var v = parseInt(lines[i-1].replace(/,/g, ''));
      if (!isNaN(v)) { views = v; vf = true; }
    }
    if (!lf && lines[i] === 'スキ' && i > 0) {
      var l = parseInt(lines[i-1].replace(/,/g, ''));
      if (!isNaN(l)) { likes = l; lf = true; }
    }
    if (vf && lf) break;
  }

  var articles = [];
  var hi = -1;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i] === '記事') { hi = i; break; }
  }
  if (hi >= 0) {
    var i = hi + 4;
    while (i < lines.length && articles.length < 10) {
      var nums = (i+1 < lines.length) ? lines[i+1].split('\t') : [];
      if (nums.length >= 3 && !isNaN(parseInt(nums[0]))) {
        articles.push({
          title: lines[i],
          views: parseInt(nums[0]) || 0,
          comments: parseInt(nums[1]) || 0,
          likes: parseInt(nums[2]) || 0
        });
        i += 2;
      } else { i++; }
    }
  }
  return JSON.stringify({ total_views: views, total_likes: likes, articles: articles });
})()
""")
    return json.loads(raw) if raw else {"total_views": 0, "total_likes": 0, "articles": []}


# ── KDP ──────────────────────────────────────────────────────────────────────

def scrape_kdp(tab: pychrome.Tab) -> dict:
    navigate(tab, "https://kdpreports.amazon.co.jp/dashboard", 6)
    js(tab, r"""
(function() {
  var els = document.querySelectorAll('a, button, span, div');
  for (var i = 0; i < els.length; i++) {
    if (els[i].textContent.trim() === '今月') { els[i].click(); return; }
  }
})()
""")
    time.sleep(3)
    raw = js(tab, r"""
(function() {
  var lines = document.body.innerText
    .split('\n')
    .map(function(l){ return l.trim(); })
    .filter(function(l){ return l.length > 0 && l.length < 80; });

  var orders = 0, kenp = 0, of = false, kf = false;
  for (var i = 0; i < lines.length; i++) {
    if (!of && lines[i] === '注文' && i+1 < lines.length) {
      var v = parseInt(lines[i+1].replace(/,/g,''));
      if (!isNaN(v) && lines[i+1].match(/^[0-9,]+$/)) { orders = v; of = true; }
    }
    if (!kf && lines[i].indexOf('KENPC') >= 0 && i+1 < lines.length) {
      var k = parseInt(lines[i+1].replace(/,/g,''));
      if (!isNaN(k) && lines[i+1].match(/^[0-9,]+$/)) { kenp = k; kf = true; }
    }
    if (of && kf) break;
  }
  return JSON.stringify({ orders_this_month: orders, kenp_this_month: kenp });
})()
""")
    return json.loads(raw) if raw else {"orders_this_month": 0, "kenp_this_month": 0}


# ── X Analytics ──────────────────────────────────────────────────────────────

def scrape_x_analytics(tab: pychrome.Tab) -> dict:
    navigate(tab, "https://x.com/i/account_analytics/content?type=posts&sort=date&dir=desc&days=7", 7)
    raw = js(tab, r"""
(function() {
  var all = document.body.innerText
    .split('\n')
    .map(function(l){ return l.trim(); })
    .filter(function(l){ return l.length > 0 && l.length < 400; });

  // インプレッション数ラベルの位置を探す
  var impIdx = -1;
  for (var i = 0; i < all.length; i++) {
    if (all[i] === 'インプレッション数' || all[i] === 'Impressions') { impIdx = i; break; }
  }

  var total_imp = 0, total_likes = 0;
  var posts = [];

  if (impIdx >= 0) {
    var i = impIdx + 1;
    while (i < all.length && posts.length < 20) {
      // "ベッキー / Becky" (or name) + "·" + 日付 = ツイート開始
      if (all[i+1] === '·' && i+2 < all.length) {
        var textStart = i + 3; // 日付の次からテキスト
        var j = textStart;
        // 連続する4つの数値を探す
        while (j < Math.min(i + 30, all.length - 3)) {
          if (/^[\d,]+$/.test(all[j]) && /^[\d,]+$/.test(all[j+1]) &&
              /^[\d,]+$/.test(all[j+2]) && /^[\d,]+$/.test(all[j+3])) {
            var imp  = parseInt(all[j].replace(/,/g,''));
            var rep  = parseInt(all[j+1].replace(/,/g,''));
            var rt   = parseInt(all[j+2].replace(/,/g,''));
            var like = parseInt(all[j+3].replace(/,/g,''));
            var txt  = all.slice(textStart, j).join(' ').slice(0, 100);
            total_imp   += imp;
            total_likes += like;
            posts.push({ text: txt, impressions: imp, likes: like, replies: rep, retweets: rt });
            i = j + 4;
            break;
          }
          j++;
        }
        if (j >= Math.min(i + 30, all.length - 3)) i++;
      } else {
        i++;
      }
    }
  }

  return JSON.stringify({ total_impressions: total_imp, total_likes: total_likes, posts: posts });
})()
""")
    d = json.loads(raw) if raw else {}
    print(f"[x_analytics] imp={d.get('total_impressions',0)} likes={d.get('total_likes',0)} posts={len(d.get('posts',[]))}", flush=True)
    return {
        "total_impressions": d.get("total_impressions", 0),
        "total_likes":       d.get("total_likes", 0),
        "posts":             d.get("posts", []),
        "period_days":       7,
    }


# ── X Developer Console ───────────────────────────────────────────────────────

def scrape_x_dev(tab: pychrome.Tab) -> dict:
    # X Dev Consoleはページ読み込みが重いため長めに待つ
    navigate(tab, "https://console.x.com/accounts/2053290251490340864", 20)
    raw = js(tab, r"""
(function() {
  var lines = document.body.innerText
    .split('\n')
    .map(function(l){ return l.trim(); })
    .filter(function(l){ return l.length > 0 && l.length < 100; });

  var credit = 0;

  // キーワード候補（日本語・英語両対応）
  var triggers = ['残りのクレジット', 'Credit remaining', '合計残高', 'Total balance'];

  for (var ti = 0; ti < triggers.length; ti++) {
    var found = false;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf(triggers[ti]) >= 0) {
        // 同行に $xx.xx が含まれるケース
        var inLine = lines[i].match(/\$([0-9]+\.[0-9]+)/);
        if (inLine) { credit = parseFloat(inLine[1]); found = true; break; }
        // 後続8行以内で $xx.xx を探す
        for (var j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          var m = lines[j].match(/^\$([0-9]+(?:\.[0-9]+)?)$/);
          if (m) { credit = parseFloat(m[1]); found = true; break; }
        }
        if (found) break;
      }
    }
    if (found && credit > 0) break;
  }

  return JSON.stringify({ credit_remaining: credit, lines_count: lines.length });
})()
""")
    try:
        result = json.loads(raw) if raw else {}
        return {"credit_remaining": result.get("credit_remaining", 0.0)}
    except Exception as e:
        print(f'[warn] platform_scraper: {e}', flush=True)
        return {"credit_remaining": 0.0}


# ── YouTube (@voice_of_becky) ─────────────────────────────────────────────────

def scrape_youtube(tab=None) -> dict:
    """動画別リストは公開RSS（認証もAPIキーも不要）。登録者数・総再生数は
    APIキーがある時だけ埋める（channels.list は公開データ、OAuth不要）。
    ponytail: RSS が最新15本しか返さないのは仕様。全件履歴が要るなら Data API へ。"""
    import urllib.request
    import xml.etree.ElementTree as ET

    ns = {
        "a": "http://www.w3.org/2005/Atom",
        "m": "http://search.yahoo.com/mrss/",
        "yt": "http://www.youtube.com/xml/schemas/2015",
    }
    out = {"subscribers": None, "total_views": None, "latest_video_id": None, "videos": []}

    url = f"https://www.youtube.com/feeds/videos.xml?channel_id={YT_CHANNEL_ID}"
    raw = urllib.request.urlopen(url, timeout=15).read()
    root = ET.fromstring(raw)
    for e in root.findall("a:entry", ns)[:10]:
        grp = e.find("m:group", ns)
        stats = grp.find("m:community/m:statistics", ns) if grp is not None else None
        rating = grp.find("m:community/m:starRating", ns) if grp is not None else None
        vid_el = e.find("yt:videoId", ns)
        title = (e.find("a:title", ns).text or "")[:120]
        vid = vid_el.text if vid_el is not None else None
        out["videos"].append({
            "video_id": vid,
            "title": title,
            "views": int(stats.get("views")) if stats is not None and stats.get("views") else 0,
            "likes": int(rating.get("count")) if rating is not None and rating.get("count") else 0,
            "published": (e.find("a:published", ns).text or "")[:10],
        })
        # ponytail: Shorts 判定はタイトルの #shorts のみ。RSS に縦横比は無く、
        # 厳密判定は videos.list(part=contentDetails) で duration<=60s が要る（APIキー時）。
        if out["latest_video_id"] is None and vid and "#shorts" not in title.lower():
            out["latest_video_id"] = vid

    key = os.environ.get("YOUTUBE_API_KEY")
    if not key:
        try:  # gitignore 済みの config.yaml から（既存の becky_api_key と同じ置き場）
            import yaml
            key = (yaml.safe_load(open(Path(__file__).parent / "config.yaml")) or {}).get("youtube_api_key")
        except Exception:
            key = None
    if key:
        api = (f"https://www.googleapis.com/youtube/v3/channels"
               f"?id={YT_CHANNEL_ID}&part=statistics&key={key}")
        d = json.loads(urllib.request.urlopen(api, timeout=15).read())
        st = d["items"][0]["statistics"]
        out["subscribers"] = int(st.get("subscriberCount", 0))
        out["total_views"] = int(st.get("viewCount", 0))
    return out


# ── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("[scraper] 起動", flush=True)
    stats: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}

    browser = pychrome.Browser(url=CDP_URL)
    tab = browser.new_tab()
    tab.start()
    tab.Page.enable()

    tasks = [
        ("youtube",      scrape_youtube),
        ("claude_api",   scrape_claude_platform),
        ("note",         scrape_note),
        ("kdp",          scrape_kdp),
        ("x_analytics",  scrape_x_analytics),
        ("x_dev",        scrape_x_dev),
    ]

    try:
        for name, func in tasks:
            try:
                print(f"[scraper] {name} ...", flush=True)
                result = func(tab)
                result['scraped_at'] = datetime.now(timezone.utc).isoformat()
                # ログインページに飛ばされてないか（0とセッション切れを区別する）
                cur_url = js(tab, "location.href") or ""
                result['login_required'] = bool(re.search(r'login|signin|/ap/|onboarding', cur_url))
                stats[name] = result
                print(f"[scraper] {name} OK → {result}", flush=True)
            except Exception as exc:
                print(f"[scraper] {name} ERROR: {exc}", flush=True)
                stats[name] = {'scraped_at': None, 'error': str(exc)}
    finally:
        # 終わったら about:blank に戻してタブを閉じる
        try:
            tab.Page.navigate(url="about:blank")
            time.sleep(0.5)
            tab.stop()
            browser.close_tab(tab)
        except Exception as e:
            print(f'[warn] platform_scraper: {e}', flush=True)

    OUTPUT.write_text(json.dumps(stats, ensure_ascii=False, indent=2))
    _append_history(stats)
    print(f"[scraper] 完了: {OUTPUT}", flush=True)

    # pychrome の daemon スレッドが終了時にノイズを出すのを防ぐ
    os._exit(0)


if __name__ == "__main__":
    main()
