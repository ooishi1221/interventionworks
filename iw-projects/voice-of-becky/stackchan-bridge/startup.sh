#!/bin/bash
# Voice of Becky — startup.sh
# 電源入れ直し後のスタックちゃん復帰コマンド
# Usage: ./startup.sh

cd "$(dirname "$0")"
.venv/bin/python3 startup.py
