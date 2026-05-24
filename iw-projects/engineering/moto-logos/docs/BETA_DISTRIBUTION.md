# β配布手順書 — Moto-Logos

2026-04-21 に確立した iOS (TestFlight) / Android (Firebase App Distribution) のβ配布体制をまとめる。

---

## 前提条件

### 共通
- Mac（Xcode 26.x + Android Studio）
- Node.js 22.14
- EAS CLI (`npm install -g eas-cli`)
- Firebase CLI (`npm install -g firebase-tools`)
- プロジェクトルート: `/Users/ooishiyuuji/Desktop/interventionworks/engineering/moto-logos`

### iOS
- Apple Developer Program 加入（個人・Team ID: `BDVPZX83RR`）
- Xcode 26.x インストール
- CocoaPods (`brew install cocoapods`)
- Fastlane (`brew install fastlane`)
- **WWDR CA G3/G6 を login keychain にインストール済み**（後述）
- Transporter.app（Mac App Store から無料、App Store Connect アップロード用）

### Android
- Android Studio（JBR + SDK 同梱）
- `moto-spotter` Firebase プロジェクトへの書き込み権限
- Firebase CLI にログイン (`firebase login`)

---

## 一発セットアップ（初回のみ）

### iOS 側

```bash
# WWDR CA をインストール（これ無いと eas build --local で証明書検証失敗）
cd /tmp
curl -fsSL -o AppleWWDRCAG3.cer https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer
curl -fsSL -o AppleWWDRCAG6.cer https://www.apple.com/certificateauthority/AppleWWDRCAG6.cer
security import /tmp/AppleWWDRCAG3.cer -k ~/Library/Keychains/login.keychain-db
security import /tmp/AppleWWDRCAG6.cer -k ~/Library/Keychains/login.keychain-db

# EAS 認証
cd engineering/moto-logos
npx eas login        # yuji1221

# App Store 用 credentials セットアップ（初回のみ・対話）
npx eas credentials
# → iOS → production → All → Apple ID ログイン → SMS 2FA → 生成
```

### Android 側

```bash
# Firebase 認証
firebase login --reauth
```

### App Store Connect

1. https://appstoreconnect.apple.com/ にサインイン
2. マイ App → + → 新規 App → iOS
3. 名前: `Moto-Logos` / プライマリ言語: 日本語 / バンドル ID: `com.interventionworks.motologos` / SKU: `moto-logos-001`

---

## iOS: TestFlight 配布フロー

### 1. Production ビルド生成

```bash
cd engineering/moto-logos
CI=1 npx eas build --profile production --platform ios --local --non-interactive --output /tmp/motologos-production.ipa
```

所要時間: 20-30分。出力: `/tmp/motologos-production.ipa`

### 2. App Store Connect にアップロード

1. Transporter.app を起動
2. **+** → ファイル選択 → `/tmp/motologos-production.ipa`
3. 右下 **配信** クリック
4. 5-15分でアップロード完了

### 3. ASC で TestFlight 設定（初回のみ）

1. App Store Connect → Moto-Logos → **TestFlight** タブ
2. ビルドが「処理中」→「テスト準備完了」になるまで待つ（10-30分）
3. **テスト情報** を入力:
   - ベータ App 説明
   - フィードバックメール
   - プライバシーポリシー URL

### 4. テスター追加

**内部テスター（即配布、審査不要・最大100人）:**
- **内部テスト** → **+** → グループ名 → Apple Developer チームメンバーから追加

**外部テスター（最大1万人、初回のみ Beta App Review 24-48h）:**
- **外部テスト** → **+** → グループ名 → メールアドレス追加 → 審査申請
- 2回目以降の新ビルドは審査なしで即時配布

### 5. 継続的な更新

- **JS/TS のみ変更**: `npx eas update --branch production` で OTA 即配信
- **ネイティブ依存変更**: 上記 1-2 を再実行 → ASC で新ビルドをテスト公開

---

## Android: Firebase App Distribution 配布フロー

### 1. APK ビルド生成

```bash
cd engineering/moto-logos
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
ANDROID_HOME="$HOME/Library/Android/sdk" \
PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH" \
GRADLE_OPTS="-Xmx8g -XX:MaxMetaspaceSize=4g" \
CI=1 npx eas build --profile preview --platform android --local --non-interactive --output /tmp/motologos-preview.apk
```

所要時間: 15-25分。出力: `/tmp/motologos-preview.apk`

### 2. Firebase App Distribution にアップロード

```bash
firebase appdistribution:distribute /tmp/motologos-preview.apk \
  --app 1:984379160455:android:af61b8a274a707a2858522 \
  --release-notes "リリースノート（バージョン説明）" \
  --groups "beta-testers"
```

### 3. テスター管理

**方法A: コマンドで配布時に指定**
```bash
firebase appdistribution:distribute ... --testers "email1@example.com,email2@example.com"
```

**方法B: Firebase Console で管理**
1. https://console.firebase.google.com/project/moto-spotter/appdistribution
2. **Testers and Groups** タブ → **+ Add group** → グループ名（例: `beta-testers`）
3. メンバー追加
4. リリースに割り当て

### 4. テスター側の受け取り方

1. 招待メール受信
2. メール内のリンクから Firebase App Tester (初回のみ) をインストール
3. 認証後、APK を自動ダウンロード&インストール
4. 更新通知も自動

---

## 継続運用

### よくある更新シナリオ

| 変更内容 | 必要な作業 | 反映時間 |
|---|---|---|
| JS/TS・UI・文言・ロジック | `eas update --branch preview` | 数分（OTA） |
| ネイティブ権限・URLスキーム | iOS: 新ビルド + ASC アップロード<br>Android: 新APK + Firebase upload | 1-2時間（新ビルド+処理） |
| 新規 expo plugin 追加 | 同上 | 同上 |

### よくあるトラブル

**Q. Android local build で `:expo-dev-menu:lintVitalAnalyzeRelease` が Metaspace OOM**
→ `plugins/withDisableLint.js` が app.json に登録されているか確認

**Q. iOS local build で `Distribution certificate hasn't been imported successfully`**
→ WWDR CA G3/G6 を login keychain に再インストール（上記セットアップ参照）

**Q. iOS production build で sentry-cli auth error**
→ `eas.json` の production プロファイル env に `SENTRY_DISABLE_AUTO_UPLOAD: "true"` が設定されているか確認

**Q. Yahoo!カーナビが開けない（「インストールされてない」表示）**
→ iOS: `LSApplicationQueriesSchemes` に `yjnavi` を追加して再ビルド
→ Android: `withYahooNaviAndroid.js` に `yjnavi` を追加して再ビルド

---

## EAS Free プランの制限と回避策

- **月間ビルド上限**: 20回 / 月（5/1 リセット）
- 上限到達時は **local build** で回避:
  - Android: 上記の通り
  - iOS: `eas build --profile <profile> --platform ios --local` で Mac ローカル
- OTA 更新は上限に含まれないので JS 変更は無制限

---

## 関連ドキュメント

- `engineering/moto-logos/CLAUDE.md` — 「iOS ローカルビルド（macOS Tahoe 必須セットアップ）」セクション
- `engineering/moto-logos/eas.json` — ビルドプロファイル定義
- `engineering/moto-logos/plugins/withYahooNaviAndroid.js` — Android URL queries
- `engineering/moto-logos/plugins/withDisableLint.js` — Android Lint OOM 回避
