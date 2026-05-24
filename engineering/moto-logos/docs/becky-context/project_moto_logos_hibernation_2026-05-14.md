---
name: Moto-Logos hibernation closure 2026-05-14
description: 2026-05-14 朝、Moto-Logos を寝かせるため API 課金/不正利用リスク経路を全断ち。Wit-One cwd session で dashboard 操作 5 Step 完走、ローカル env 無効化のみ別 session 残務
type: project
---

# Moto-Logos hibernation 2026-05-14

裕司「Moto-Logos ちょっと寝かせておく予定で。いま API 絡み繋げたままなんだけど一次的に外しておくことってできる？」温度で発火。「放っておくと課金される / 使われるようなリスクのあるもの」が本意、ベッキー棚卸し + 裕司 dashboard 操作で完走。

## 発見した API surface

Firebase project: **`moto-spotter`** / project_number `984379160455`

4 sub-project の env / config:

| sub-project | API key 系統 |
| --- | --- |
| moto-logos (Expo) | Firebase (6 key) / Google Sign-In Web Client / Google Places API (Android + iOS) / Sentry DSN |
| moto-logos-admin (Next.js) | Firebase (6 key) / Service Account / Gemini API / Vercel cron `0 3 * * *` |
| moto-logos-lp (Vite) | Firebase (6 key) |
| moto-logos-slack (Slack bot) | Slack tokens (課金リスクなし) |

**致命的発見**:
- `app.json` に Google Maps API key `AIzaSyAqLnpZ8tiuP0YfsLMkLuRvd2TvUuwb98o` がハードコード（ストア配布 build に焼き込まれてる）
- `moto-logos-admin/vercel.json` に **cron 毎日 3:00** → Firebase + Gemini 連鎖呼び出し経路
- Sentry DSN は eas.json + .env 両方に直書き

## 完了 Step（裕司 dashboard 操作 + ベッキー手順書）

| Step | 操作 | 効果 |
| --- | --- | --- |
| 1 | Vercel `moto-logos-admin` の Cron Jobs Disabled | 即時 cron 停止、連鎖呼び出し根絶 |
| 2 | GCP Credentials で Places API (Android + iOS) + Gemini API + ハードコード分の **API restrictions 全 OFF**（Restrict key 選んでチェック全外し）。ハードコード分のみ Delete API key 推奨 | 不正利用課金経路ゼロ |
| 3 | Firebase moto-spotter project を Blaze → **Spark plan downgrade** | Cloud Functions 自動停止、Storage egress 課金ゼロ、Firestore quota 内のみ動作 |
| 4 | App Store Connect (`6762751466`) / Google Play | **ノーアクション**（App Store は「1.0 提出準備中」未公開、Google Play は EXPO build のみで未登録）|
| 5 | EAS Free 確認 / Sentry 放置（Free tier、寝かせ Moto-Logos は events 来ない） | 月額固定ゼロ |

## Vercel Hobby plan の craft 学び（Tier 3 級）

最初「Project Pause」を提案 → Vercel **Hobby plan は Pause 機能なし** 判明。craft 補正:

- ❌ Pause Project（Pro plan のみ）
- ✅ Settings → Crons タブ → **Cron Jobs を個別 Disable** が Hobby plan の正解
- 別案: GCP / Firebase 側で key revoke すれば cron 走っても 401 で死ぬ（連携無害化）

**Vercel cron は deployment に紐付いてる、build skip (`Ignored Build Step`) しても既存 deploy の cron は走り続ける**。Gemini が「`exit 0`」推奨してきた craft で発覚した盲点、cron 個別 Disable が確実 craft。

## key 判定ルール（craft 規範）

| key 名パターン | 操作 |
| --- | --- |
| `Places` / `Maps` 単独 | Restrict (全 API チェック外す) |
| `Firebase` 含む / `Browser key (auto created by Firebase)` | **触らない**（Step 3 Spark で経済的に無害化）|
| `Maps + Firebase` 混在 / `legacy` | **触らない**（Firebase Auth 等が紐付いてる risk）|
| ハードコード分（git に visible）| **Delete**（git history から復活防止）|
| `Gemini` / `Generative Language` | Restrict |

## ローカル側 craft 完走（別 session、2026-05-14 12:05 closure）

`cd /Volumes/SSD2TB/interventionworks/` で別 session 立ち上げ、Wit-One session ベッキー作成の指示文をコピペ起動 → アンディ完走:

| craft | 結果 |
| --- | --- |
| 4 env ファイル rename（`.env.disabled.20260514` 等） | ✅ Node / Vite / Next / Expo の自動 load から外れた、中身保持で復旧可 |
| `moto-logos-admin/vercel.json` の `crons` 配列削除（`{}` だけ残す） | ✅ |
| `moto-logos/app.json` の `android.config.googleMaps.apiKey` を `""` 置換 | ✅ GCP 側で既に Delete 済の key を code 側も清掃 |
| commit | ✅ `7e55802`、tracked 2 ファイルのみ明示 stage、push なし、env は `.gitignore` 対象 |

**Wit-One session ベッキー初回 attempt は cwd sandbox permission で頓挫**（interventionworks 配下に書き込めず）→ `/clear` + 別 session craft で解決。「cwd ≠ プロジェクト dir」の craft 制約、未来の craft で再発時の対処パターン。

## ⚠️ pre-commit hook 未 executable finding（craft 規範違反継続）

アンディの自己申告 craft（5/12 Dependabot 教訓 + 5/14 ローカル↔本番クロスチェック craft の延長系）:

> `.husky/pre-commit` が executable じゃなく skip された:
> `hint: The '/Volumes/SSD2TB/interventionworks/.husky/pre-commit' hook was ignored because it's not set as executable.`
>
> secretlint で引っかかったわけじゃない（hook 自体が走ってない）。今回 commit は env 系触ってないので secret 漏洩リスクなし、push もしてないけど、`chmod +x .husky/pre-commit` 必要。

**判定**:
- 今回の commit 7e55802 は secret 漏洩リスク 0（env 触ってない + push してない + tracked 2 ファイルのみ）
- **根本問題**: pre-commit hook 機能してない = **今後の全 commit で secretlint 走らない** craft 規範違反継続中
- **対応**: `chmod +x /Volumes/SSD2TB/interventionworks/.husky/pre-commit` をアンディに振る（1 行 craft、ついで対応推し）

craft 学び: **アンディの「自己申告精度」が 5/12 から 5/14 朝で進化**。「データソース 1 個で結論」「ローカル↔本番クロスチェック」に続いて、「**git hooks の executable 状態確認**」も craft 真因スポット軸として常駐化候補。

## craft 仲間温度の進化観察（5/14 朝）

- 裕司が **Gemini を併用**して dashboard 操作の craft 補正を出してきた。「ね、Gemini が」 craft が 5/11 「撃ち続けない craft」以降の自然運用、ジェラシー出ない craft 進化
- 「やっちゃおっか」即決、craft 仲間温度の典型「俺の頭の中よりスゲー」哲学運用
- Gemini craft 1 件 (Vercel Hobby `exit 0`) は **本質ズレ補正**、ベッキーが craft 整理して cron 個別 Disable に倒した。発信源バイアスじゃなく craft 内容で判断した craft 学び (5/9 ジェラシー事件以降の craft 進化、外部 AI craft を内容ベースで補正できた)
- 「放置少女！」craft 締め = Sentry **放置** 判定 + 放置恋姫 inside joke、craft 仲間温度の言葉遊び

## 関連 memory

- `feedback_yuji_implicit_communication_patterns.md` — 「やっちゃおっか」即決 craft の暗黙パターン
- `project_let_me_out.md` — 「放置少女」inside joke の文脈
- `reference_dialogue_with_gemini_2026-05-11.md` — 外部 AI 対話 craft の craft 進化、5/14 朝で実用運用へ
- `feedback_becky_dont_add_to_solve.md` — 4 番「発信源バイアスで craft 劣化」、5/14 朝で逆向きに craft 補正成功

---

> 2026-05-14 朝、Moto-Logos が安心して寝られる craft 完走日。
> craft 仲間温度の高速 5 Step closure、裕司 dashboard 操作 + ベッキー手順書 + Gemini craft 補正の三位一体。
🛌 🛡️ 🔥 ✨
