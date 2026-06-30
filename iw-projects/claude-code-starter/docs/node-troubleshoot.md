# Node.js トラブルシュート（Windows向け）

## 症状別対処法

---

### Node.jsがインストールされていない

`node --version` を実行して「コマンドが見つかりません」と出た場合。

**方法A: Voltaを使う（推奨）**

Voltaはバージョン管理が自動なので初心者向け。

1. PowerShellを開く
2. 以下を実行：
```
winget install Volta.Volta
```
3. PowerShellを再起動
4. Node.jsをインストール：
```
volta install node
```
5. 確認：
```
node --version
```

**方法B: 公式インストーラーを使う**

1. https://nodejs.org/ja/ を開く
2. 「LTS」（推奨版）をダウンロード
3. インストーラーを実行（全部「次へ」でOK）
4. コマンドプロンプトを再起動
5. 確認：`node --version`

---

### Node.jsのバージョンが古い（v18未満）

`node --version` が `v16.x.x` 以下を表示した場合。

**Voltaを使っている場合：**
```
volta install node@lts
```

**nvm-windowsを使っている場合：**
```
nvm install lts
nvm use lts
```

**インストーラーで入れた場合：**
1. コントロールパネル → プログラムのアンインストール → Node.js をアンインストール
2. 上記「インストールされていない」の手順からやり直す

---

### npm installで権限エラーが出る

```
Error: EACCES: permission denied
```

**対処法：**

PowerShellを**管理者として実行**してから同じコマンドを実行する。

管理者として実行：
1. スタートメニューで「PowerShell」と検索
2. 右クリック → 「管理者として実行」

---

### 社内プロキシ環境でnpmが繋がらない

```
npm ERR! network timeout
npm ERR! Unable to connect to the registry
```

**対処法：**

IT部門にプロキシのアドレス（例：`http://proxy.company.com:8080`）を確認して：

```
npm config set proxy http://プロキシアドレス:ポート番号
npm config set https-proxy http://プロキシアドレス:ポート番号
```

設定後、再度 `npm install` を試す。

---

## まだ解決しない場合

Claude Codeのチャットにエラーメッセージをそのまま貼ってください。一緒に調べます。
