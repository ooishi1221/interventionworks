# Claude Code Security Guidelines

このドキュメントは Intervention Works 全プロダクト（Moto-Logos / Slight / 将来プロダクト）のセキュリティと信頼性を担保するための最優先ルール。エンジニア歴20年の知見に基づき「バイブコーディング」脱却のための指針を定義する。

CLAUDE.md の `## Security` セクションが**原則の要約**、本ドキュメントが**運用詳細と実装チェックリスト**である。矛盾した場合は本ドキュメントを優先する。

---

## 1. セキュリティ原則

### 1.1 シークレット管理の徹底
- **ハードコードの禁止**: APIキー、秘密鍵、トークンをコードやプロンプトに直接記述しない。必ず環境変数（`.env`）や EAS Secrets / Firebase Secret Manager 等の仕組みを利用すること。
- **権限の最小化**: 提案する API キーやサービス連携は必要最小限の権限（Least Privilege）に留めること。Firebase Admin SDK のサービスアカウントは用途別に分ける。
- **漏洩防止**: エラーメッセージ、ログ出力、Sentry / Slack への通知、AI への回答内にシークレットが含まれないよう厳格にチェックする。Sentry の `beforeSend` でマスキングを入れる。
- **コミット前チェック**: `git diff --cached` で `.env`, `*serviceAccount*.json`, `AIza`, `sk-`, `ghp_`, `eyJ` 等のパターンを目視する。疑わしければ `git reset` し、疑わしい鍵はローテーションする。

### 1.2 認可とデータ保護
- **IDOR 対策**: 「ログインできる」ことと「他人のデータが見えない」ことは別物。データアクセス時は必ずサーバー側（Firestore Rules / Admin API Route）で「実行ユーザーがそのデータへの所有権・権限を持っているか」を確認する。
  - Moto-Logos の `photos`, `users/{uid}/blocks`, `debug_reports` 等は **必ず** Firestore Rules で `request.auth.uid` 所有権検証を入れる。
  - Admin Dashboard の API Route（`src/app/api/...`）は **必ず** サーバーサイドで ID トークン検証 + admin claim チェック。
- **入力の不信**: クライアントサイドのバリデーションを過信しない。すべての入力値を「敵対的なデータ」として扱い、サーバー側で型・長さ・形式・範囲・MIMEタイプを厳格にチェックする。写真アップロードは Storage Rules でサイズ上限・MIME チェック。
- **PII の最小化**: ライダーの位置情報は生データを長期保存しない。足跡として集約するなら粒度を落とす。匿名化できる箇所は匿名化する。

### 1.3 外部依存関係
- **ライブラリの検証**: 使用するライブラリを鵜呑みにせず、実績・メンテナンス状況・脆弱性（CVE / `npm audit`）を確認した上で採用する。`preinstall` でスクリプトを走らせるような怪しいパッケージは拒否する。
- **情報の隠蔽**: 詳細なスタックトレース、内部ファイルパス、Firestore ドキュメント ID 等をエンドユーザーの画面に露出させない。Sentry 等内部ツールに限定する。
- **ロックファイル尊重**: `package-lock.json` は必ずコミット。`npm ci` 系で再現可能なビルドを担保する。

---

## 2. 設計と運用

### 2.1 データ構造の優先
- コードの修正よりもデータ構造の変更の方が遥かに困難。Firestore のスキーマ変更は**過去データの移行コスト**を見積もってから提案する。
- 新規コレクション追加時は、同時に Firestore Rules と TypeScript 型（`firestoreTypes.ts`）も更新する。片方だけ更新するのは禁止。

### 2.2 異常系の考慮
- 「ハッピーパス」だけでなく「処理の途中でエラーが起きたらどうなるか（整合性）」を常に考慮する。
- 複数ドキュメントの更新は **Firestore トランザクション**または **バッチ書き込み**を使う。
- モバイル側はオフライン / 電波不安定を前提にする。楽観的 UI 更新と失敗時のロールバックをセットで実装する。

### 2.3 環境の分離
- 開発環境と本番環境を厳格に分ける。
  - Firebase プロジェクト: dev / staging / prod が別であれば別プロジェクトを用意。現状は `moto-spotter` のみなので、**書き込み系スクリプトは必ず dry-run を先に実行**する。
  - EAS チャンネル: `preview` / `production` を混同しない。`eas env:push` のチャンネル指定を必ず確認。
- 本番 DB や本番認証情報をローカル開発に直接参照させる提案はしない。

---

## 3. 非機能要件の確認

実装案を提示する際、以下を自己チェックし必要に応じて CEO に確認する。

- **コスト**: 提案するアーキテクチャや API 利用が予期せぬ高額請求を招かないか。
  - Gemini API、Places API、Firebase Reads/Writes は**呼び出し単価 × 想定回数**を事前に試算する。
  - クライアントから直接呼ぶ API はレート制限をサーバー側で設ける（Firestore Rules の rate limit or Cloud Functions でラップ）。
- **法的確認**: 利用するライブラリのライセンス（MIT/Apache/GPL 等）、データの取り扱い（GDPR / 個人情報保護法 / 位置情報）が法的に問題ないか。LP の `privacy-policy.md` / `terms-of-service.md` と矛盾しないか。
- **性能**: 数万件のデータが入っても動作するか、計算量が膨大にならないか。Firestore クエリは必ずインデックスを `firestore.indexes.json` に追加する。

---

## 4. Intervention Works 特有のリスク

本プロジェクト固有の**過去ハマり事例**と対策。仮説ドリブンで深掘りする前にここを先に確認すること。

### 4.1 環境変数の注入漏れ（2026-04-20 事案）
**症状:** 実機で Firebase `invalid-api-key` の無言死。
**原因:** `.env` を更新したが `eas env:push` を忘れてビルドに注入されなかった。
**対策:** EAS Build 前に **必ず** `cd engineering/moto-logos && npm run preflight [preview|production]` を実行する。

### 4.2 Firestore Rules の緩み
**症状:** 公開 API で他ユーザーのデータが書き換え可能になる。
**対策:** ルール変更時は Firebase Emulator で所有権テストを走らせる。`request.auth.uid == resource.data.ownerId` のパターンを崩さない。

### 4.3 Admin API の認可漏れ
**症状:** `src/app/api/.../route.ts` でトークン検証を忘れ、誰でも叩ける。
**対策:** API Route は **すべて** ミドルウェアでトークン検証 + admin claim チェックを通す。公開エンドポイント（`/api/public/*`）は明示的にディレクトリで分ける。

### 4.4 デバッグログからの PII 漏洩
**症状:** `debug_reports` コレクションや Sentry にユーザーの位置情報・メール・UID が平文で残る。
**対策:** `src/utils/debug.ts` 経由で送信するデータはマスキングを通す。Sentry の `beforeSend` で PII をスクラブする。

---

## 5. 自動チェック（pre-commit + security-check）

持続性の低い人間の目視チェックに頼らない。機械に止めさせる。

### pre-commit hook（自動発火）

リポジトリルートで `npm install` 済みなら、コミットごとに自動で走る:

- `secretlint` がステージされたファイルをスキャンし、以下のパターンを検知したら**コミットを中断**:
  - Firebase Admin SDK 秘密鍵（`-----BEGIN PRIVATE KEY-----` / `"type": "service_account"`）
  - Gemini / Google Maps / Places API キー（ラベル付き `AIza...`）
  - AWS Access Key ID（`AKIA.../ASIA...`）
  - OpenAI API キー（`sk-...` / `sk-proj-...`）
  - Sentry Auth Token（`sntrys_...`）
  - Slack Bot/App Token（`xoxb-...` / `xapp-...`）
  - GitHub Personal Access Token（`ghp_...`）
  - 他 preset-recommend が拾うもの（AWS/Azure/GCP/1Password/NPM/Shopify/SendGrid/Linear）

設定ファイル: `.secretlintrc.json` / `.secretlintignore` / `.husky/pre-commit` / `package.json:lint-staged`

**緊急時のバイパス**（通常使わない）: `git commit --no-verify`。使った場合は本 SECURITY.md に理由を追記する。

### `npm run security-check`（手動/CI で発火）

リポジトリルート、または各プロジェクト内から実行可能（各プロジェクトの `security-check` スクリプトはルートへ委譲）:

```bash
npm run security-check
```

実行内容:
1. `secretlint` でリポジトリ全体をスキャン（`.secretlintignore` を尊重）
2. 各プロダクト（moto-logos / moto-logos-admin / moto-logos-lp / moto-logos-slack）で `npm audit --audit-level=high --omit=dev`

**推奨発火タイミング:**
- EAS Build の前（preview / production どちらも）
- `/deploy-admin` / `/deploy-lp` の前
- 依存関係を追加/更新した直後
- CF ローンチ前（Slight）

### コミット前セルフチェックリスト

機械チェックが拾えない部分は人間が見る:

- [ ] Firestore Rules / Storage Rules を変更した場合、`firestore.rules` がリポジトリに含まれ、Emulator テストが通ったか
- [ ] 新規 API エンドポイントに認可チェック（ID トークン検証 + 所有権/admin claim チェック）が入っているか
- [ ] `.env.example` が実際のキーと同期しているか（実キーが増えたら example にもプレースホルダを追加）
- [ ] エラーメッセージ・ログ・Sentry 送信データに PII / シークレットが混入していないか
- [ ] `security-check` の audit 結果で**新規**の high / critical が増えていないか（既知分は本ドキュメントに allowlist 追記で明示）

### 既知の audit 結果

**2026-04-23 時点: 全プロジェクトで high/critical ゼロ。** β 社内テスト段階で `npm audit fix` を実行し、transitive 経由の critical protobufjs（Gemini SDK）+ high x3（@xmldom/xmldom / basic-ftp）を一括解消済み（commit `2678e06`）。

moderate / low は残るが、実際の攻撃シナリオが成立しない依存（uuid v3/v5/v6 の buf 引数未使用、fast-xml-parser を外部入力で使わない等）。四半期レビューで再評価する。

**新規 high/critical が出た場合:**
1. `npm audit fix` で非-breaking 修正を試す
2. breaking のみで修正可能な場合、社内テスト段階なら許容（β 前なら即修正）
3. どちらも不可なら overrides でピン留め + 本ドキュメントに保留理由を明記

### 認可監査の結果（2026-04-23 実施）

Admin Dashboard の全 58 API Route を監査（Explore agent + サンプル目視検証）:

- **Critical/High: ゼロ**
- 56/58 ルートが `requireAuth(minimumRole)` + Session Cookie + ROLE_HIERARCHY で一貫保護
- 破壊系（ban/unban/role/delete/bulk-delete/dev-reset）は全て `moderator` 以上、または `super_admin` 限定
- cron は `CRON_SECRET` Bearer で保護
- 公開エンドポイント（`/api/public/*`, `/api/auth/*`）は意図的
- 1件の medium 穴（ban_appeals POST が body.userId を信じる）は修正済み（commit `7e8605a`）

詳細は git log を参照。次の監査トリガー:
- 新規 API Route 追加時（PR レビューチェック項目）
- admin 脱退/権限変更時

---

## 6. インシデント対応

1. **検知**: Sentry 通知 / Slack `#moto-logos-dev-log` / ユーザー報告 / 外部報告
2. **切り分け**: 影響範囲（ユーザー数、データ種別、露出時間）を 30 分以内に確定
3. **止血**: 該当機能の feature flag off、または鍵のローテーション、または rules のロックダウン
4. **根本原因**: 再発防止策をこの SECURITY.md に追記し、同じ失敗を二度しない
5. **通知**: ユーザーへの影響がある場合、Communications（Becky）と協議の上、LP / アプリ内で告知

---

今後の InterventionWorks でのアプリ制作ではこのポリシーに沿って進める。矛盾する実装を見つけたら、実装ではなく本ドキュメントを先に疑い、必要なら更新する。
