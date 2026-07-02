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
import time
from datetime import datetime, timezone
from pathlib import Path

import pychrome

CDP_URL = "http://localhost:9223"
OUTPUT = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists/platform_stats.json")


def js(tab: pychrome.Tab, code: str):
    result = tab.Runtime.evaluate(expression=code)
    return result["result"].get("value")


def navigate(tab: pychrome.Tab, url: str, wait: float = 2.5) -> None:
    tab.Page.navigate(url=url)
    time.sleep(wait)


# ── Claude Platform ──────────────────────────────────────────────────────────

def scrape_claude_platform(tab: pychrome.Tab) -> dict:
    navigate(tab, "https://platform.claude.com/dashboard", 3)
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


# ── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("[scraper] 起動", flush=True)
    stats: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}

    browser = pychrome.Browser(url=CDP_URL)
    tab = browser.new_tab()
    tab.start()
    tab.Page.enable()

    tasks = [
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
    print(f"[scraper] 完了: {OUTPUT}", flush=True)

    # pychrome の daemon スレッドが終了時にノイズを出すのを防ぐ
    os._exit(0)


if __name__ == "__main__":
    main()
