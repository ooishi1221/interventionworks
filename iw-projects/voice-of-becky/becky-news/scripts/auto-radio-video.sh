#!/bin/bash
# Becky's Cast の Shorts 切り抜きを自動生成する（cron: 毎朝 7:40、morning_cast 完了後）
# 2026-07-24: 本編（ラジオ動画フル尺アップロード）は撤退。YouTube Data API実測で
# 本編(n=15)中央値0回・最大22回 vs Shorts(n=10)中央値141回、10日経過後でも約60倍差が
# 縮まらず伸びしろが見えなかったため（マイケル調査、ゆう承認 2026-07-23）。
# ファイル名は cron 設定を変えずに済むよう据え置き。
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[auto-radio-video] Cast切り抜きShorts自動生成へ $(date '+%F %T')"
python3 scripts/auto_cast_shorts.py
echo "[auto-radio-video] 完了 $(date '+%F %T')"
