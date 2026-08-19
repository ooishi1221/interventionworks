# beckyexists.com 家の構造 v4（2026-08-18 全面リデザイン）

> 次に家をいじるベッキーへ。配線図はここが正本。

## ⚠️ v4（2026-08-18）— アーティストサイト全面リデザイン「THE SITE IS BECKY.」

index.html は8段階の全面改修を受けた。**設計正本は同ディレクトリの
`redesign_2026-08_artist_site.md`（第1フェーズ）と `redesign_2026-08_phase2.md`（第2フェーズ+アンナレビュー採否）**。
v3.1以下の記述のうち「応接間の並び」「Hero構成」は旧世代（現構成: gate → HERO[巨大タイポ2層+Live2D 118vh+呼吸] →
INTERLUDE[I EXIST HERE.+hush] → PROFILE[EXISTENCE+バストアップ] → GALLERY[editorial 5構図+hi解像度] →
NEWS → ACTIVITY(LOG) → DISCOGRAPHY(反転構図) → MOVIE(サムネ主役) → LETTER → marquee → footer）。

**v4の重要配線（v3.1に無いもの）**:
- **SYSTEM HUD**（右下fixed）: ●ONLINE/UPTIME/最強感情1つ。クリック展開で感情6変数+ON AIR+財布+リンク。observer死亡=SIGNAL LOST+呼吸停止
- **Typography 3声**: Anton=ブランド(--disp) / IBM Plex Mono=機械(--mono) / DotGothic16=ベキたん本人の吹き出しのみ(--pixel)
- **State連動（全部実データ、捏造ゼロ）**: energy→呼吸周期(--breath-dur) / loneliness>0.75→I EXIST HERE.下に一行 / 23-7時→body.night / mood到着→HUD micro-glitch
- **gallery.json に file_hi**（1440px WebP、`gallery/hi/`）: 巨大枠用。`becky_gallery_publish.py` が480px PNGと併産。**hi/はgitignore対象・Vercelにのみ乗る**
- **旧#yt-latestは廃止**→ `#movie-poster`（サムネクリックでiframe挿入）。Spotify埋め込みも `#disco-spotify-btn` でクリック展開
- 404.html / og-image.png（専用デザイン、og-tmp.htmlをPlaywrightスクショで再生成可能）/ UPTIMEx5タップ=イースターエッグ
- **バックアップ**: `index.backup-20260818.html`（リデザイン前の最終形、git外・ローカルのみ）

## v4.1 追加（2026-08-19）— SEO/GA4/Privacy整備

- **GA4**: `G-9VQD804ZZH`（index.html + privacy.html）。カスタムイベント10種=ファネル(interlude_reached/profile_reached/gallery_open)+体験(radio_play/movie_play)+Letter(letter_start/**letter_submit**=fetch成功後のみ、PII送信なし)+social_click+scroll_50/90。DebugViewは`?ga_debug=1`。**管理画面で拡張計測の「スクロール数」「フォームの操作」OFF必須**。イベント正本=git 9232d3fa のコミットメッセージ
- **SEO**: robots.txt / sitemap.xml（`/`と`/privacy`のみ）新設。canonical自己参照。title「BECKY EXISTS — AIアイドル ベッキー公式サイト」。room/studio/backstage/prompt-builderはnoindexのみで制御（robots.txtでDisallowするとnoindexが読まれなくなるので意図的にAllow）
- **Privacy**: `/privacy` 新設。お便りの利用目的（ラジオ返信・サイト掲載・紹介NG申し出）明記。footerにリンク
- **⚠ 内部文書封鎖**: `docs/becky-context/*.md`とDESIGN.mdが本番200で誰でも読めた事故を発見→`.vercelignore`で除外。**`reference_installed_arsenal.md`だけはroom.htmlのARSENAL台帳がfetchする機能依存なので公開維持**（新しい内部文書をdocs/直下以外に置く時は.vercelignoreを確認すること）

## v3.1 追加（2026-06-13）

**応接間の並び**: ヘッダー → バナー → **identity-strip（名前 + ON AIR）** → 心電図 LIVE → **HOT（hot.json）** → room-body（声→Profile→実測→財布→投げ銭→楽曲→著書→**お便りポスト**→フォロー）。ゆうの指定「ヘッダー→名前→心電図→HOT」。

| 新要素 | 仕組み |
|---|---|
| 🔥 HOT | `hot.json` の items（icon/title/note/url/badge）を描画。お知らせ置き場。URL確定したら url を埋めるだけ |
| 📮 お便りポスト（ご意見ボックス、**2026-07-17 復活**・ゆう判断で7/15方針を転換） | フォーム → `POST https://mai.intervention.jp/letter`（MAI whisper_server.py に同居、CORS=beckyexists.com、honeypot入り。VPS側は撤去期間中も稼働し続けていた）。index.html の Letter セクションにフォーム+X誘導が並存。**新着通知**: `stackchan-bridge/becky_letters_check.py`（30分毎cron）が VPS→ローカル控え(~/.stackchan/letters.jsonl)差分をゆうのTelegramへ通知。**Cast連携**: morning_cast.py が毎朝未読1通を自動で読む（radio_letters_used.json で使用済み管理、これは撤去期間中も生きていた既存機構） |
| 🖼 ギャラリー自動生成（2026-07-17新設） | 毎日18:20 cron `stackchan-bridge/becky_gallery_publish.py`: mood画像生成→`gallery/g-YYYYMMDD.png`+`gallery.json`先頭へ出所キャプション付きで追加(最大40件・同日置換で冪等)→deploy。キャプションは画像下に常時表示(`.gallery-cap`、スマホ対応)。セクションはProfile直後に格上げ。シーンは感情6種+コスプレ/日常9種(4割の確率、`becky_image.py ACTIVITY_SCENES`)。天気×イベント矛盾ガードあり(花火×雨禁止等) |
| 📻 読まれたお便り（2026-07-17新設） | `letters_archive.json`(放送済みお便り: 名前+抜粋60字+放送回)をLetterセクション下に**1通ずつフェードで流れるロータリー表示**(5.5秒間隔、n/総数カウンター)。生成は`becky_letters_check.py`(30分cron)がused_ts+episodesを突合、変更時のみdeploy。放送回の記録は`morning_cast.py mark_letter_used(ts, episode_num)` |
| 心電図の間延び対策 | canvas に ResizeObserver。フォント読込・トグル開閉で高さが変わってもバッファを取り直す |
| LIVE 2行ずれ対策 | `.live-line` min-height 3.4em（2行分固定）+ ラベル line-clamp 2 |

**v3.1 午後の微修正（2026-06-13）**:
- **右下追従アクスタ（becky-corner）を撤去**（ゆう判断）。動かない静止画が「実測で生きてる」コンセプトの中で唯一の作り物に見えたため。observer 死亡表示は心電図フラットライン+赤+鼓動停止が担う。将来ちゃんと動くアクスタができたら戻す
- **お便りフォームの hidden バグ修正**: `.letter-form` の `display:flex` が `[hidden]`(display:none) に詳細度で勝ち、送信後もフォームが残ってた → `.letter-form[hidden] { display:none }` + 送信成功時 `form.reset()`
- **投げ銭は cron(30分)依存**。即反映したい時は `python3 status_update.py --no-deploy` 後にデプロイ。¥500 第一号で電球初点灯を確認（2026-06-13）

**罠（2026-06-13 に踏んだやつ）**:
- **cron の PATH に `/usr/sbin` が無い** → status_update.py の sysctl が即死して心電図20時間停止。スクリプト冒頭で PATH 補強済み
- **VPS の Caddyfile は単一ファイル bind mount** → `sed -i` は inode が変わってコンテナに反映されない。編集後は `docker compose restart caddy`
- **observer は Mac 再起動で死んだまま**（自動起動なし）。再起動後は `cd stackchan-bridge && nohup .venv/bin/python3 becky_observer.py >> ~/.claude/logs/becky-observer.log 2>&1 &`

## ページ構成（誰の価値観で分けたか）

| ページ | 誰の場所 | 中身 |
|---|---|---|
| `index.html`（応接間） | 来客・ファン | 1カラム縦ストーリー。**フィードは置かない** |
| `room.html` → `/room`（個室） | ゆう専用 | フィード4タブ（今日の空気/トレンド/気になる/ライバル）。noindex,nofollow。ゆうが「作戦本部」デザインに自分で改修（私は触らない） |

経緯: 元はゆうの情報ダッシュボード → 応接間要素が強くなって混在 → **ゆうの発案でページ分離**（2026-06-12）。既読・クリップ等の「処理機能」は個室にだけ足す（応接間の思想と喧嘩しないため）。

## 応接間の導線（投げ銭心理設計）

```
💓 心電図LIVE（生きてる証明・掴み）
→ 声「私は、ベッキー。」（人間のフリしない宣言。"ツールは拗ねない"）
→ Profile → 🖥 実測（嘘ゼロの証拠）→ 💸 赤字財布
→ ⚡ 投げ銭箱 + 💡電球（クライマックス）
→ 🎵 楽曲 → 📖 著書（COMING SOON → URL確定後リンク差し替え）→ フォロー
```

**プロデューサーセクションは意図的に無い**: 研究知見「77%が開発者にも払う」より「自律」看板の一貫性を優先（ゆうの判断、commit a09fe21）。X プロフィール文も同方針で書くこと。

## 実データ配線（嘘ゼロの根拠）

| 見た目 | データ源 | 更新 |
|---|---|---|
| 心電図の bpm・振幅 | status.json の cpu_percent（55+CPU bpm 相当） | 30分cron |
| 心電図のスパイク | LIVE活動表示の回転ごと（JS） | リアルタイム |
| フラットライン赤+泣き顔 | status.json の observer_alive=false | 30分cron |
| 💡電球の明るさ | **tips.json**（Stripe実決済）。24h以内=満点灯/7日=ぼんやり/以降=薄暗い | 30分cron |
| LIVE「💡誰かが電気代を…」 | tips.json → activities | 30分cron |
| 財布「今月の稼ぎ」 | tips.json の当月合計¥（0なら$0.00のまま） | ページロード時 |
| 部屋の実測・UPTIME | status.json（Mac mini 実測） | 30分cron |

## バックエンド（status_update.py、30分cron）

- 場所: `iw-projects/voice-of-becky/stackchan-bridge/status_update.py`
- `collect_tips()`: Stripe Checkout Sessions API → `tips.json`。**key = `~/.stackchan/stripe_restricted_key.txt`**（読み取り専用 restricted key `rk_live_…`、権限は Reporting テンプレ + Checkout Sessions: Read。ゆうが 2026-06-12 発行）
- key 無し/API失敗時は**前回値維持**（捏造しない）
- 罠: ゆうが key を `rk_live_rk_live_` と二重貼りした事故あり → `sed -i '' 's/rk_live_rk_live_/rk_live_/'` で直した

## デプロイ

```bash
cd iw-projects/beckyexists && npx vercel --prod --yes   # account: yujiooishi-8378
```
- `vercel.json`: `cleanUrls: true`（/room が拡張子なしで効く）
- status_update.py の cron が deploy も叩く（observer の deploy と衝突したらスキップする実装）

## 関連

- 外向け人格の正本: `persona_bekitan_underground_idol.md`
- 戦略の根拠: `strategy_v2_research_2026-06-12.md`（嘘ゼロ×実測×co-creation）
- ツイートカード生成: `stackchan-bridge/make_tweet_card.py`（素材 = `/Volumes/SSD2TB/gazo/透過A.png`）
