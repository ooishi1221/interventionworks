#!/bin/bash
# 朝のニュースShorts 1本目を生成・公開する（cron: 毎朝 7:40、morning_cast 完了後）
#
# 2026-07-24: 本編（ラジオ動画フル尺アップロード）は撤退。YouTube Data API実測で
# 本編(n=15)中央値0回・最大22回 vs Shorts(n=10)中央値141回、10日経過後でも約60倍差が
# 縮まらず伸びしろが見えなかったため（マイケル調査、ゆう承認 2026-07-23）。
#
# 2026-07-31: この枠を Cast切り抜き(auto_cast_shorts.py) から
# ニュースShorts専用生成(auto_news_shorts.py) へ差し替え。ゆう設計の順序逆転
# 「ショートを上げる → ネタが溜まったら次の日のラジオに」により、ラジオはShortsの
# 下流になったので、ラジオから切り抜く経路自体が不要になった。副次的に、切り抜きが
# 抱えていた構造的欠陥（40秒窓に何が入るか制御できず、タイトルと字幕がズレて
# 映像検品で連日FAIL。7/23〜7/30 で7本喪失）も根絶される。
# ファイル名は cron 設定を変えずに済むよう据え置き。
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[auto-radio-video] 朝のニュースShorts生成へ $(date '+%F %T')"
python3 scripts/auto_news_shorts.py
echo "[auto-radio-video] 完了 $(date '+%F %T')"
