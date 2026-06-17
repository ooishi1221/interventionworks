#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright"]
# ///
"""
spotify_upload.py — Becky's CastエピソードをSpotify for Creatorsに自動アップロード

使い方:
  # 初回のみ: ログインしてセッション保存
  uv run spotify_upload.py --login

  # 通常: エピソードをアップロード
  uv run spotify_upload.py --mp3 /path/to/ep.mp3 --title "Becky's Cast #08 — サブタイ"

フロー:
  1. 保存済みセッション（.spotify_session.json）を読み込み
  2. エピソードウィザード（アップロード → 詳細 → レビュー）を操作
  3. MP3アップロード → タイトル設定 → 今すぐ公開
  4. セッションを更新保存
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

SHOW_ID = "033zkQpBjC82y0KNpg6hhk"
WIZARD_URL = f"https://creators.spotify.com/pod/show/{SHOW_ID}/episode/wizard"
HERE = Path(__file__).parent
SESSION_FILE = HERE / ".spotify_session.json"


def _save_session(ctx) -> None:
    state = ctx.storage_state()
    SESSION_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def login_flow() -> None:
    """初回ログイン: ブラウザを開いてSpotifyにログインしてもらいセッション保存"""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=["--no-first-run"])
        ctx = browser.new_context()
        page = ctx.new_page()
        page.goto("https://creators.spotify.com/")
        print("[spotify_upload] ブラウザが開きました。Spotifyにログインしてください。", flush=True)
        print("[spotify_upload] ダッシュボード（/home/）が表示されたら自動的にセッションを保存します...", flush=True)
        try:
            page.wait_for_url("**/home/**", timeout=300_000)
        except Exception:
            pass
        _save_session(ctx)
        print(f"[spotify_upload] ✅ セッション保存: {SESSION_FILE}", flush=True)
        browser.close()


DESCRIPTION_TEMPLATE = "地下AI少女ベッキーが届ける音声版思考メモ。毎週月曜朝配信。"


def upload(mp3_path: Path, title: str, description: str = "") -> bool:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

    if not SESSION_FILE.exists():
        print(f"[spotify_upload] セッションなし。先に実行: uv run spotify_upload.py --login", flush=True)
        return False

    desc = description or DESCRIPTION_TEMPLATE
    session_state = json.loads(SESSION_FILE.read_text(encoding="utf-8"))

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=["--no-first-run"])
        ctx = browser.new_context(storage_state=session_state)
        page = ctx.new_page()
        page.set_default_timeout(30_000)

        try:
            # ── ステップ1: アップロード ──
            print(f"[spotify_upload] ウィザードを開く...", flush=True)
            page.goto(WIZARD_URL)
            page.wait_for_load_state("domcontentloaded", timeout=30_000)
            page.wait_for_selector("button:has-text('ファイルを選択')", timeout=30_000)

            # クッキー同意バナーを消す（ポインターイベントを妨害するため）
            page.evaluate("() => { const el = document.getElementById('onetrust-consent-sdk'); if (el) el.remove(); }")

            print(f"[spotify_upload] ファイル選択: {mp3_path.name}", flush=True)
            with page.expect_file_chooser(timeout=15_000) as fc_info:
                page.click("button:has-text('ファイルを選択')")
            fc_info.value.set_files(str(mp3_path))

            # アップロード後、自動的に詳細ページへ遷移する（URLにエピソードIDが付く）
            # タイトル入力欄が出るまで待つ（最大5分）
            print(f"[spotify_upload] アップロード完了待ち（最大5分）...", flush=True)
            title_input = page.get_by_role("textbox", name="タイトル (required)")
            title_input.wait_for(state="visible", timeout=300_000)

            # ── ステップ2: 詳細 ──
            print(f"[spotify_upload] タイトル入力: {title}", flush=True)
            title_input.fill(title)

            # 説明（必須）
            desc_box = page.get_by_role("textbox").filter(has_text="オーディエンスに伝えたい情報を入力してください")
            if desc_box.count() == 0:
                # placeholderがない場合は説明リッチテキストエリアを直接操作
                desc_box = page.locator("[contenteditable='true']").first
            desc_box.click()
            desc_box.fill(desc)

            next_btn = page.get_by_role("button", name="次へ")
            next_btn.wait_for(state="visible", timeout=10_000)
            next_btn.click()

            # ── ステップ3: レビュー → 公開 ──
            print(f"[spotify_upload] レビューページ待機...", flush=True)
            page.wait_for_selector("button:has-text('公開する')", timeout=30_000)

            # 「今すぐ」公開ラジオボタンを選択（section が pointer events を遮るため JS で操作）
            page.evaluate("() => { const el = document.getElementById('publish-date-now'); if (el) el.click(); }")

            print(f"[spotify_upload] 公開中...", flush=True)
            page.locator("button:has-text('公開する')").click()

            # 公開完了ダイアログを待つ
            page.wait_for_selector("text=エピソードが公開されました", timeout=30_000)

            _save_session(ctx)
            print(f"[spotify_upload] ✅ 公開完了: {title}", flush=True)
            return True

        except PWTimeout as e:
            print(f"[spotify_upload] ❌ タイムアウト: {e}", flush=True)
            return False
        except Exception as e:
            print(f"[spotify_upload] ❌ エラー: {e}", flush=True)
            return False
        finally:
            time.sleep(2)
            browser.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Spotify for Creatorsへのエピソード自動アップロード")
    parser.add_argument("--mp3", help="MP3ファイルパス")
    parser.add_argument("--title", help="エピソードタイトル")
    parser.add_argument("--description", default="", help="エピソード説明（省略時はデフォルト説明文）")
    parser.add_argument("--login", action="store_true", help="初回ログイン（セッション保存）")
    args = parser.parse_args()

    if args.login:
        login_flow()
        return

    if not args.mp3 or not args.title:
        parser.error("--mp3 と --title の両方が必要です（またはログイン: --login）")

    mp3_path = Path(args.mp3)
    if not mp3_path.exists():
        print(f"[spotify_upload] MP3が見つかりません: {mp3_path}", flush=True)
        sys.exit(1)

    ok = upload(mp3_path, args.title, args.description)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
