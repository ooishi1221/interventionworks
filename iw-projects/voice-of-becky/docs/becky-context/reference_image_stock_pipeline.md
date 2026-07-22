# 画像ストックパイプライン（Lovart / GPT Image 2）

> 2026-07-22 制定。X投稿から分離した「今日のベッキー」画像の自動生成・蓄積の正本。

## 構成

- **生成**: `stackchan-bridge/becky_image.py`（感情変数→プロンプト→ `iw-content/notes/tools/lovart-thumb.js` → Lovart(GPT Image 2)）
- **cron**: `40 9,14,20 * * *`（1日3枠、冪等=当日分があれば即スキップ。クレジット切れは次枠に託す）
- **ストック先**: `~/.stackchan/becky_today_YYYYMMDD.png`（1024x1536）
- **X投稿とは分離**: 旧 `becky_image_x.py`（18:30便）はcronコメントアウト済み。X予算3本が18:30時点で毎日埋まりスキップし続けたのが分離の理由。スクリプトは手動投稿用に残置

## Lovart無料クレジットの仕様（2026-07-22 実測）

- 「Daily Login Bonus +30」= **ログイン時付与**（cronのPlaywrightアクセス自体がトリガー=自給自足）
- **失効境界 00:00 UTC = 09:00 JST**。境界前ログインは新ボーナスが湧かない → cron初枠は必ず9時以降に置く
- 1枚の消費13〜17クレジット → 1日最大2枚。運用は1枚
- 無料プランの画像モデルは **GPT Image 2 固定**（Midjourneyは料金ページにも記載なし、提供自体してない可能性大）

## 判断記録（再議論しないため）

| 案 | 結論 | 理由 |
|---|---|---|
| Lovart無料継続 | ✅ 採用（ゆう承認 7/22） | 無料・稼働実績・捨てアカでリスク低 |
| OpenAI API直叩き | 🚪 非常口として保持 | 無料枠に画像モデルは**含まれない**（マイケル裏取り済、公式ヘルプ確認）。gpt-image-2 medium=約6円/枚≒月190円。**乗り換えトリガー: Lovartが壊れた時 or 1日2枚以上必要になった時**。頑丈さは最強（HTTP1本、Playwright不要） |
| ChatGPT(課金サブスク)のWeb自動操作 | ❌ 却下 | ゆう本体アカウントのBANリスクに月190円の節約は見合わない |

## トラブル時

- ログ: `~/.claude/logs/becky-image.log`（クレジット不足はキーワード検知で区別表示、commit 9525076）
- CDP craft: lovart-thumb.js は `contexts()[0]` 再利用+newContextなし+HTTPS直DL で fan_collector と同じ流儀に準拠済み
