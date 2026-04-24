# マシン環境セットアップ詳細

Mac mini M4 をプライマリとしてリモート常用する前提。CLAUDE.md（ルート）の「マシン環境」セクションからここへ誘導される。

---

## 1. 新しい Mac でリポジトリから環境を作る

```bash
git clone https://github.com/ooishi1221/interventionworks.git
cd interventionworks

cd engineering/moto-logos && npm install
cd ../moto-logos-admin && npm install
cd ../moto-logos-lp && npm install
cd ../moto-logos-slack && npm install
```

**Node バージョン:** v24.14.1（nvm管理）。メイン機と揃える。Homebrew の node を使うと別バージョンで install されて node_modules が汚染されるので NG。

---

## 2. env ファイルと秘密鍵の配置

CLAUDE.md の env一覧表を参照。すべて git 管理外なので手動配置が必要。メインマシンから 1Password / iCloud Drive 経由で転送する。

**配置先:**
- `engineering/moto-logos/.env`
- `engineering/moto-logos-admin/.env.local`
- `engineering/moto-logos-lp/.env.local`
- `engineering/moto-logos-slack/.env`
- `engineering/moto-logos/scripts/moto-spotter-firebase-adminsdk-*.json`（Admin SDK 鍵）

各ディレクトリに `.env.example` があるのでテンプレートとして使う。

---

## 3. 各種 CLI のログイン（初回のみ）

```bash
# Expo / EAS
npx eas login
npx eas whoami   # yuji1221 / yuji.ooishi@intervention.jp

# Vercel (Admin Dashboard デプロイ用)
npx vercel login

# Firebase CLI (Firestore rules デプロイ用)
npx firebase login
npx firebase use moto-spotter
```

gcloud は任意（未インストールでも運用可）。

---

## 4. EAS Secrets 確認

EAS Secrets はクラウド側に保存されているのでマシン切り替え時の再設定は不要。ただし全キー揃っているかは確認する:

```bash
cd engineering/moto-logos
eas env:list preview
eas env:list production
```

`.env` に新しいキーを追加した時は push:

```bash
eas env:push preview --path .env --force
eas env:push production --path .env --force
```

これを忘れると実機ビルドで `auth/invalid-api-key` 等で無言死する（2026-04-20 事例）。

---

## 5. Android ローカルビルド（EAS Free 上限超過時）

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
cd engineering/moto-logos
eas build --profile preview --platform android --local
```

### iOS ローカルビルド

Xcode 必須（Mac のみ）。通常は EAS クラウドビルドを使う:

```bash
eas build --profile preview --platform ios
```

---

## 6. ライブラリ更新ポリシー

- **Expo SDK の minor 更新**: `npx expo install --check` で推奨版に合わせる
- **Expo SDK の major 更新** (例: 54→55): `npx expo upgrade` で一括。必ず別ブランチで
- **ネイティブ依存の個別更新**: `npx expo install <pkg>@latest` → 型チェック → EAS preview で試す
  - newArch 絡みで `--check` が古い版を推奨するケースあり（例: react-native-maps 1.20.1 推奨 → 1.27.2 が必要）
- **更新後は必ず preview ビルドで実機検証**。JS だけの変更なら OTA で足りる。ネイティブ依存は要フルビルド

---

## 7. Claude Code 設定

`.claude/` は commit 対象外。memory ディレクトリは iCloud Drive 経由で同期するのが楽。

Bash tool は非対話シェルで起動するため macOS 上で `.zprofile` を読まない。nvm で入れた node を使うコマンドは先頭に `export PATH` を付ける:

```bash
export PATH="$HOME/.nvm/versions/node/v24.14.1/bin:$PATH" && <コマンド>
```
