#!/usr/bin/env python3
"""
platform_scraper.py — Gemini Chrome（CDP :9223）経由で各ダッシュボードをスクレイプ

Usage:
    python3 platform_scraper.py

依存: pip install pychrome
出力: iw-projects/beckyexists/platform_stats.json
"""
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pychrome

CDP_URL = "http://localhost:9223"
OUTPUT = Path("/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists/platform_stats.json")

_browser: pychrome.Browser | None = None


def get_browser() -> pychrome.Browser:
    global _browser
    if _browser is None:
        _browser = pychrome.Browser(url=CDP_URL)
    return _browser


def new_tab() -> pychrome.Tab:
    tab = get_browser().new_tab()
    tab.start()
    tab.Page.enable()
    return tab


def close_tab(tab: pychrome.Tab) -> None:
    try:
        tab.stop()
        get_browser().close_tab(tab)
    except Exception:
        pass


def js(tab: pychrome.Tab, code: str) -> str | None:
    result = tab.Runtime.evaluate(expression=code)
    return result["result"].get("value")


def navigate(tab: pychrome.Tab, url: str, wait: float = 2.5) -> None:
    tab.Page.navigate(url=url)
    time.sleep(wait)


# ── Claude Platform ──────────────────────────────────────────────────────────

def scrape_claude_platform() -> dict:
    tab = new_tab()
    try:
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
    finally:
        close_tab(tab)


# ── note stats ───────────────────────────────────────────────────────────────

def scrape_note() -> dict:
    tab = new_tab()
    try:
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
    finally:
        close_tab(tab)


# ── KDP ──────────────────────────────────────────────────────────────────────

def scrape_kdp() -> dict:
    tab = new_tab()
    try:
        navigate(tab, "https://kdpreports.amazon.co.jp/dashboard", 6)
        # 「今月」タブをクリック
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
    finally:
        close_tab(tab)


# ── X Developer Console ───────────────────────────────────────────────────────

def scrape_x_dev() -> dict:
    tab = new_tab()
    try:
        navigate(tab, "https://console.x.com/accounts/2053290251490340864", 9)
        raw = js(tab, r"""
(function() {
  var lines = document.body.innerText
    .split('\n')
    .map(function(l){ return l.trim(); })
    .filter(function(l){ return l.length > 0 && l.length < 100; });

  var credit = 0;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('残りのクレジット') >= 0) {
      for (var j = i; j < Math.min(i+6, lines.length); j++) {
        var m = lines[j].match(/^\$([0-9.]+)$/);
        if (m) { credit = parseFloat(m[1]); break; }
      }
      break;
    }
  }
  return JSON.stringify({ credit_remaining: credit });
})()
""")
        return json.loads(raw) if raw else {"credit_remaining": 0.0}
    finally:
        close_tab(tab)


# ── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("[scraper] 起動", flush=True)
    stats: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}

    tasks = [
        ("claude_api", scrape_claude_platform),
        ("note",       scrape_note),
        ("kdp",        scrape_kdp),
        ("x_dev",      scrape_x_dev),
    ]

    for name, func in tasks:
        try:
            print(f"[scraper] {name} ...", flush=True)
            stats[name] = func()
            print(f"[scraper] {name} OK → {stats[name]}", flush=True)
        except Exception as exc:
            print(f"[scraper] {name} ERROR: {exc}", flush=True)
            stats[name] = None

    OUTPUT.write_text(json.dumps(stats, ensure_ascii=False, indent=2))
    print(f"[scraper] 完了: {OUTPUT}", flush=True)

    # pychrome の daemon スレッドが終了時にノイズを出すのを防ぐ
    os._exit(0)


if __name__ == "__main__":
    main()
