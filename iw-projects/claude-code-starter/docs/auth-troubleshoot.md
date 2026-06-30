# 認証トラブルシュート

## Claude Codeにログインする

### 基本手順

1. ターミナルで `claude` を実行
2. ブラウザが開いてログイン画面が表示される
3. Anthropicアカウントでログイン（Googleアカウントでも可）
4. 「認証が完了しました」と表示されたらOK
5. ターミナルに戻るとチャットが始まる

---

## 症状別対処法

---

### ブラウザが開かない

ターミナルにURLが表示される場合：

1. 表示されたURLをコピー
2. ブラウザのアドレスバーに貼り付けてEnter
3. ログイン後、ターミナルに戻る

---

### 「API key not found」または「認証エラー」

**方法A: 再ログイン**

```
claude logout
claude
```

再度ブラウザでログインする。

**方法B: APIキーを手動設定**

1. https://console.anthropic.com/ にログイン
2. 「API Keys」→「Create Key」でキーを作成
3. ターミナルで：
```
claude config set api-key sk-ant-xxxxxxxxxxxxx
```

---

### 社内プロキシ環境でログインできない

認証URLにアクセスできない場合。

**対処法：**

1. IT部門にプロキシの設定を確認
2. 環境変数を設定してからClaude Codeを起動：

PowerShell:
```powershell
$env:HTTPS_PROXY = "http://プロキシアドレス:ポート番号"
claude
```

コマンドプロンプト:
```
set HTTPS_PROXY=http://プロキシアドレス:ポート番号
claude
```

---

### 「Permission denied」でclaudeコマンドが動かない

PowerShellを管理者として実行して：
```
npm install -g @anthropic-ai/claude-code
```

インストール後、通常のPowerShellで `claude` を実行する。

---

### Windowsのパス問題（claudeコマンドが見つからない）

npmのグローバルインストール先がPATHに含まれていない場合。

1. 以下を実行してnpmのグローバルパスを確認：
```
npm config get prefix
```

2. 表示されたパスに `\` + `node_modules` + `\.bin` を追加したものがPATH

例：`C:\Users\ユーザー名\AppData\Roaming\npm` が表示された場合、
`C:\Users\ユーザー名\AppData\Roaming\npm` をシステムの環境変数PATHに追加

3. 追加方法：
   - スタートメニュー → 「環境変数」で検索
   - 「システム環境変数の編集」を開く
   - 「環境変数」ボタン → PATHを選択 → 「編集」
   - 「新規」でパスを追加

4. PowerShellを再起動して `claude --version` を確認

---

## まだ解決しない場合

Claude Codeのチャットに以下を貼ってください：
- エラーメッセージ全文
- `node --version` の結果
- `npm --version` の結果
- Windowsのバージョン（設定 → システム → バージョン情報）
