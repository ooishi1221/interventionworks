---
name: Vercel deploy は manual 必須 (wit-one リポジトリ配下 全般)
description: `wit-one` リポジトリ配下の Vercel プロジェクトは GitHub auto deploy が動かない構成。git push しても本番反映されないので、 `vercel deploy --prod --yes` を CLI から叩く craft が必要。blackpanda-lp で 2 連続 (5/18・5/19) + ai-survey でも踏んだ (5/22) 罠
type: reference
---

# Vercel deploy 罠：blackpanda-lp は manual deploy 必須

## 症状

`/Volumes/SSD2TB/wit-one/security/blackpanda-lp/` で `git push` しても、 Vercel ダッシュボード上で deploy が走らない。 本番ドメイン（blackpandair1.wit-one.co.jp）に変更が反映されない。

## 原因（推定）

`wit-one` リポジトリは monorepo 構造で、 `security/blackpanda-lp/` がサブディレクトリにある。 Vercel プロジェクトの GitHub 連携設定がサブディレクトリの変更を検知できてない可能性。 もしくは GitHub App 権限 / ルート設定で auto deploy が無効化されてる。

`vercel ls` で確認すると、 最新の deploy が **21h 前**で止まってる症状になる。

## 復旧 craft（毎回 manual deploy）

```bash
cd /Volumes/SSD2TB/wit-one/security/blackpanda-lp
git add <files>
git commit -m "..."
git push                          # GitHub には push（履歴は残す）
vercel deploy --prod --yes        # ★ ここが必須 ★
```

`vercel deploy --prod --yes` 叩くと、 production target で 12 秒〜数十秒で deploy 完了。 数十秒で本番 URL に反映される。

## CLI 出力の癖

production deploy が成功しても、 最後の JSON 出力に `"command": "vercel deploy --prod", "when": "Promote to production"` という sugges­tion が出てくる。 これは Vercel CLI の表示仕様で、 すでに target: production の deploy 自体は完了してる（重ねて叩かなくて OK）。

## 踏んだ履歴

| 日付 | 文脈 | 気づくまで |
|---|---|---|
| 2026-05-18 夜 | OG 画像差し替え commit `c8d99c1` → 反映されず | アンナと OG 検証中に発覚、 手動 deploy で復旧 |
| 2026-05-19 夕方 | /deck 価格表記修正 commit `b7bf378` → 反映されず | PDF 化準備中に発覚、 `vercel ls` で 21h 前 deploy 発見 → 手動 deploy で復旧 |
| 2026-05-22 朝 | ai-survey/web の index.html ダーク → ライト切替 + ロゴ配置 commit 連発 → 反映されず | `curl -I` で `age: 58693` (16h キャッシュ) を発見、 `cd ai-survey/web && vercel --prod --yes` で復旧 |

## craft 教訓

**`wit-one` リポジトリ配下の Vercel プロジェクトは全部 manual deploy**。 該当プロジェクトのディレクトリに `cd` してから `vercel --prod --yes` を叩く。 GitHub auto deploy を期待しない。

該当プロジェクト一覧 (2026-05-22 時点):
- `security/blackpanda-lp/` → `blackpandair1.wit-one.co.jp`
- `ai-survey/web/` → `wit-one-ai-survey.vercel.app`

## 関連

- `working/security_blackpanda_lp.md` — Blackpanda LP 全般
- `working/reference_vercel_deploy_iw_hp_2026-05-11.md` — IW HP の Vercel deploy 経験（別構成）
