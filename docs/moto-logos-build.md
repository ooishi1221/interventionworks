# Moto-Logos ビルド・配信

EAS Build プロファイルと iOS ローカルビルドのリファレンス。
CLAUDE.md から「EAS Build 実行・iOS ローカルビルドをする時」に参照される。

マシン初期セットアップ（CLIログイン等）は `docs/machine-setup.md` 参照。

---

## EAS Build（3プロファイル構成）

`eas.json` で定義:

| プロファイル | 用途 | 配布 | channel |
|------------|------|------|---------|
| `development` | 開発用 dev client | 内部 + iOSシミュレータ | `development` |
| `preview` | テスト配布（実機） | Internal Distribution | `preview` |
| `production` | ストアリリース | App Store / Google Play | `production` |

共通設定: Node 22.14.0 / Sentry DSN 環境変数注入 / `appVersionSource: "remote"` / `autoIncrement: true`

```bash
# 開発ビルド（iOSシミュレータ）
eas build --profile development --platform ios

# テスト配布（実機）
eas build --profile preview --platform all

# 本番リリース
eas build --profile production --platform all

# OTA 更新（JS のみの変更）
eas update --branch preview
```

---

## iOS ローカルビルド（macOS Tahoe 必須セットアップ）

EAS Free プランの月次上限超過時や緊急時に Mac でローカルビルドする。**初回のみ**以下の前提セットアップが必要。

### 前提

- Xcode 26.x
- CocoaPods（`brew install cocoapods`）
- fastlane（`brew install fastlane`）
- Apple Developer 個人アカウント Team ID: `BDVPZX83RR`
- EAS にログイン済み（`npx eas login`）

### 最重要: WWDR CA を login keychain に手動インストール

macOS Tahoe (26.x) のデフォルト keychain には WWDR CA G3/G6 が含まれていない。これが無いと `security find-identity` が「0 valid identities found」を返し、`fastlane import_certificate` で証明書はインポートされても EAS の chain validation で **silent fail** する。

```bash
cd /tmp
curl -fsSL -o AppleWWDRCAG3.cer https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer
curl -fsSL -o AppleWWDRCAG6.cer https://www.apple.com/certificateauthority/AppleWWDRCAG6.cer
security import /tmp/AppleWWDRCAG3.cer -k ~/Library/Keychains/login.keychain-db
security import /tmp/AppleWWDRCAG6.cer -k ~/Library/Keychains/login.keychain-db
```

### ビルドコマンド

```bash
cd engineering/moto-logos
CI=1 npx eas build --profile preview --platform ios --local --non-interactive --output /tmp/motologos-preview.ipa
```

15-25 分で `.ipa` が生成される。

### 症状確認

ビルドが `Distribution certificate with fingerprint XXX hasn't been imported successfully` で失敗する → WWDR CA G3/G6 未インストール。上記 curl + security import で解決。
