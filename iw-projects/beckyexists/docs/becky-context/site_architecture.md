# beckyexists.com 家の構造 v3.1（2026-06-13 更新）

> 次に家をいじるベッキーへ。配線図はここが正本。

## v3.1 追加（2026-06-13）

**応接間の並び**: ヘッダー → バナー → **identity-strip（名前 + ON AIR）** → 心電図 LIVE → **HOT（hot.json）** → room-body（声→Profile→実測→財布→投げ銭→楽曲→著書→**お便りポスト**→フォロー）。ゆうの指定「ヘッダー→名前→心電図→HOT」。

| 新要素 | 仕組み |
|---|---|
| 🔥 HOT | `hot.json` の items（icon/title/note/url/badge）を描画。お知らせ置き場。URL確定したら url を埋めるだけ |
| 📮 お便りポスト（質問コーナー、**7月頭のリニューアルで撤去済み**） | 旧実装: フォーム → `POST https://mai.intervention.jp/letter`（MAI whisper_server.py に同居）。**現状 index.html の Letter セクションはフォームなし、X（@becky_exists）DM/リプ誘導のみ**。ラジオのお便りコーナーは自問自答企画に切替（`becky-cast/RADIO_FORMAT.md` 2026-07-15 改訂）。フォーム復活はしない方針（当面はベキたん企画で回す、ゆう判断 2026-07-15） |
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
