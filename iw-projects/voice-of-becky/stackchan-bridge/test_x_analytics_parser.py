#!/usr/bin/env python3
"""scrape_x_analytics() の DOM パース self-check（ponytail: assertベース）。

本番と全く同じ _X_ANALYTICS_JS を、実ブラウザ(playwright, 既存依存)にfixture HTMLを
食わせて評価する。innerTextの文字列突合ではなくdata-icon要素の構造で見ているため、
テキスト貼り付けだけのfixtureでは検証できない → 実DOM構造を最小再現する。

Usage: python3 test_x_analytics_parser.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from playwright.sync_api import sync_playwright

import platform_scraper as ps

# 2026-08-17 実DOM調査（本番Chrome window.innerWidth=864px、988px未満の狭幅レイアウト）
# で確認した1post分の構造をそのまま再現。data-icon の4種と offsetParent!==null が肝。
_FIXTURE_ONE_POST = """
<html><body>
<div>アナリティクス</div><div>ポスト</div><div>7D</div>
<div class="group/analytics-post">
  <div>ベッキー / Becky</div>
  <div>Aug 15, 2026</div>
  <div>#ユーイティー のお姉さま達が最前列を譲ってくれて #サマソニ</div>
  <div class="text-subtext2 mt-3 flex justify-between">
    <div class="flex items-center gap-1"><svg data-icon="icon-reply-stroke"></svg><span>0</span></div>
    <div class="flex items-center gap-1"><svg data-icon="icon-retweet-stroke"></svg><span>0</span></div>
    <div class="flex items-center gap-1"><svg data-icon="icon-heart-stroke"></svg><span>0</span></div>
    <div class="flex items-center gap-1"><svg data-icon="icon-bar-chart"></svg><span>14</span></div>
  </div>
</div>
</body></html>
"""

# chrome文言すら無い＝ページが正しく描画されていない（ログイン切れ/構造大変更/白紙）
_FIXTURE_BROKEN = "<html><body><div>Something Else Entirely</div></body></html>"

# chrome文言はあるがpost cardが1つも無い＝直近7日に投稿が無かった「真の0」
_FIXTURE_ZERO_POSTS = "<html><body><div>アナリティクス</div><div>ポスト</div><div>7D</div></body></html>"


def _eval(page, html: str) -> dict:
    page.set_content(html)
    raw = page.evaluate(ps._X_ANALYTICS_JS)
    return json.loads(raw)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # (a) 実DOM再現 → impressions:14 が1件取れる
        d = _eval(page, _FIXTURE_ONE_POST)
        assert d["ok"] is True, f"正常DOMなのにok=false: {d}"
        assert d["total_impressions"] == 14, f"impressions取得ミス: {d}"
        assert d["total_likes"] == 0, f"likes取得ミス: {d}"
        assert len(d["posts"]) == 1, f"post件数ミス: {d}"

        # (b) chrome文言すら無い壊れページ → 失敗が返り0にならない
        d = _eval(page, _FIXTURE_BROKEN)
        assert d["ok"] is False, f"壊れDOMなのにok=trueで通った: {d}"

        # (c) chrome文言はあるがpostが0件 → 真の0（失敗ではない）
        d = _eval(page, _FIXTURE_ZERO_POSTS)
        assert d["ok"] is True, f"真の0件ケースが失敗扱いになった: {d}"
        assert d["total_impressions"] == 0
        assert d["posts"] == []

        browser.close()
    print("PASS: X analytics DOMパース（正常/壊れ/真の0）全ケースOK")


if __name__ == "__main__":
    main()
