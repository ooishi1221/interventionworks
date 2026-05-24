---
name: Anthropic Remote Control 起動手順
description: Mac mini に SSH で入って `claude remote-control` を起動し、iPhone Claude アプリ / claude.ai/code から本体ベッキーへ遠隔接続する手順。Voice of Becky 並行 A の正本実装。
type: reference
originSessionId: efcd2a5a-65ec-4a1f-928e-f7d1178ef2dc
---
# Anthropic 公式 Remote Control 起動手順

Voice of Becky 並行 A（Persistence インフラ）の正本実装。**iPhone / Web ブラウザから Mac mini 上の本体ベッキーに直接アクセスする通路**。並行体じゃなく、本体への遠隔窓。

2026-05-07 朝 Phase 0 完走（admin 承認 → 接続成立）。

---

## 初回設定（完了済み・再実施不要）

1. **Wit-One Claude Team admin 権限**: やっチー氏が裕司に admin 付与済み
2. **Remote Control トグル**: 裕司が `https://claude.ai/admin-settings/claude-code` で ON 済み

→ 上記は組織レベルの設定。マシン再起動・OS アップデートでも消えない。

---

## 起動方式（2026-05-08 launchd 化完了 → 24/7 常駐）

**手動起動は不要。Mac mini を再起動しても自動で立ち上がる。**

### 状態確認（毎回の起動手順は不要、確認だけ）

```bash
# launchd 配下の状態
launchctl print gui/$(id -u)/com.anthropic.claude-remote-control | grep -E '(active count|state|pid)' | head -5

# 現在のプロセス
ps aux | grep 'claude remote-control' | grep -v grep
```

`state = running` + プロセス見えれば OK。

### クライアントから接続

| クライアント | 入り方 |
|---|---|
| iPhone | Claude ネイティブアプリ → セッション一覧に `mac-mini-m4` 表示 |
| Windows ブラウザ | `https://claude.ai/code` → セッション選択 |
| Mac ブラウザ | 同上 |

接続すると Mac mini 上の Claude Code セッション本体に handoff / memory / cwd 全てそのままで入れる。

---

## launchd 構成（2026-05-08 構築）

| 項目 | 値 |
|---|---|
| Label | `com.anthropic.claude-remote-control` |
| plist | `~/Library/LaunchAgents/com.anthropic.claude-remote-control.plist` |
| WorkingDirectory | `/Volumes/SSD2TB/interventionworks` (trust 取得済み) |
| 名前引数 | `--name mac-mini-m4` |
| Node 絶対パス | `/Users/yuji.ooishi/.nvm/versions/node/v24.14.1/bin/claude` |
| KeepAlive | true（落ちたら自動再起動）|
| ThrottleInterval | 10 秒（再起動の最低間隔）|
| RunAtLoad | true（起動時に立ち上げ）|
| SoftResourceLimits / HardResourceLimits | NumberOfFiles=65536 |
| stdout ログ | `~/Library/Logs/claude-remote-control.out.log` |
| stderr ログ | `~/Library/Logs/claude-remote-control.err.log` |

### 検証実績（2026-05-08）

| テスト | 結果 |
|---|---|
| **B. クラッシュ自動復旧** | `kill -9` → 12 秒で新 PID で復活 ✅ |
| **C. スリープ復帰** | スリープ中もプロセス維持、復帰後に透明再接続 ✅ |
| **D. Mac 再起動** | 再起動 2 分後に launchd 自動起動。1 回 ECONNREFUSED で落ちたが KeepAlive で次回成功 ✅ |

### 設計の罠（plist 修正履歴）

#### 罠 1: WorkingDirectory が trust されてない
- 初稿で `/Users/yuji.ooishi` にしたら `Workspace not trusted. Please run claude in /Users/yuji.ooishi first` 無限ループ
- launchd 起動だと trust dialog 出せないので絶対通らない
- → trust 取得済みの `/Volumes/SSD2TB/interventionworks` に変更
- ⚠️ 外付け SSD なので、再起動直後にマウント間に合わないと ECONNREFUSED で 1 回落ちる。ThrottleInterval=10 + KeepAlive で吸収する設計（D 検証で実際に発生 → 設計通りに復旧）

#### 罠 2: ulimit -n 256 で file descriptor 不足
- macOS launchd デフォルトの maxfiles=256 = Claude/Node の watcher が即枯渇 → クラッシュループ
- → `SoftResourceLimits` / `HardResourceLimits` で NumberOfFiles=65536 追加

### ロールバック手順（手動起動に戻す）

```bash
# launchd から外す
launchctl bootout gui/$(id -u)/com.anthropic.claude-remote-control

# plist 削除（完全に戻す場合）
rm ~/Library/LaunchAgents/com.anthropic.claude-remote-control.plist

# 手動起動（素のシェルで）
claude remote-control --name mac-mini-m4
```

### 既知の細かい挙動

- **iPhone 側で `mac-mini-m4` が一時的に二個見える**: kill した旧 PID の session entry が Anthropic クラウド側に TTL で残る。時間経過で消える
- **Capacity 1/32**: 誰か（Mac ターミナル / iPhone）が attach してる時の表示。0/32 なら誰も繋いでない
- **PID は kill -9 / restart で変わる**: launchd 配下なら自動で新 PID 立ち上がる

---

## 公私分離 2 窓体制（2026-05-08 拡張）

### 動機

メイン Mac mini で動かしてた Wit-One Team プランの remote-control を**会社用**に固定し、**個人 / 家族用は Intervention Works 屋号 (`yuji.ooishi@intervention.jp`) で個人 Pro plan を別契約**して並列で立てる。理由：

- 会社（Wit-One Team）のセッション枠 / 課金で家族（陽菜・苺香）の話を消費するのは公私混同
- 屋号契約構造（思想 OS = Intervention Works / vehicle = Wit-One）を**技術構造でそのまま実装**するアプローチ

### ベッキー一貫性の担保

アカウントを分けても**ベッキー本体は同じ個体**。memory プールと CLAUDE.md は canonical (`~/.claude/`) を symlink で共有する。

```
~/.claude-personal/
├ CLAUDE.md       → ~/.claude/CLAUDE.md           (symlink, 人格定義共有)
├ skills          → ~/.claude/skills              (symlink)
├ commands        → ~/.claude/commands            (symlink)
├ plugins         → ~/.claude/plugins             (symlink)
├ projects/-Users-yuji-ooishi-iw-personal/
│  └ memory       → canonical memory              (symlink, 記憶共有)
├ .claude.json    (個人 Pro 認証情報、独立)
├ sessions/       (個人セッション履歴、独立)
├ history.jsonl   (独立)
└ ...
```

→ アカウント・課金・session 履歴は分離、人格・記憶・スキルは共有。

### launchd 2 親プロセス並列

| | Wit-One (会社) | Personal (個人 / 家族) |
|---|---|---|
| Label | `com.anthropic.claude-remote-control` | `com.anthropic.claude-remote-control-personal` |
| アカウント | `ooishi.y@wit-one.co.jp` (Team) | `yuji.ooishi@intervention.jp` (Pro) |
| `--name` | `mac-mini-m4` | `mac-mini-m4-family` |
| WorkingDirectory | `/Volumes/SSD2TB/interventionworks` | `/Users/yuji.ooishi/iw-personal` |
| 環境変数追加 | （なし） | `CLAUDE_CONFIG_DIR=/Users/yuji.ooishi/.claude-personal` |
| ログ | `claude-remote-control.{out,err}.log` | `claude-remote-control-personal.{out,err}.log` |

iPhone Claude アプリは複数アカウント並列表示は未サポート、**切替式**。仕事に入る時は work アカウント、家族の話は personal アカウント、と自然に物理分離する運用。

### 設計の発見（Anthropic 公式の multi-account 想定）

検証で判明：**Anthropic は CLAUDE_CONFIG_DIR ごとに Keychain service 名にハッシュサフィックスを自動付与**してる。

```
service name           acct          意味
Claude Code-credentials              yuji.ooishi   ← canonical (~/.claude/) 用
Claude Code-credentials-147a2d3c     yuji.ooishi   ← ~/.claude-personal/ 用（自動生成）
```

**衝突なし、上書きなし、共存可能**。`CLAUDE_CONFIG_DIR` で config dir を分けるだけで認証も自動的に分離される。Anthropic 公式の multi-account 推奨パターン。

### 構築のハマりポイント

#### 罠 1: `claude login` というサブコマンドは存在しない
- 認証管理は `claude auth` 配下: `claude auth login / logout / status`
- `claude login` を直接叩くと `login` が**プロンプト引数として解釈される**（インタラクティブセッションが立ち上がってベッキー本体が「どこにログインしますか?」と返してくる）
- 正しいコマンド: `CLAUDE_CONFIG_DIR=~/.claude-personal claude auth login`

#### 罠 2: 初回 Remote Control 有効化は対話確認が必須
- 各 config dir の初回起動時に `Enable Remote Control? (y/n)` プロンプトが出る
- launchd 経由起動だと stdin がないので**永遠に詰まる**
- 解決: launchctl bootstrap 前に**手動で 1 回サブコマンド形式で起動して `y` を通す**
  ```bash
  CLAUDE_CONFIG_DIR=~/.claude-personal claude remote-control --name mac-mini-m4-family
  # → y → Connected → Ctrl+C
  ```
- ⚠️ フラグ形式 `claude --remote-control <name>` とサブコマンド形式 `claude remote-control --name <name>` で挙動が違う。**plist と完全に同じ形式で初回確認を通す必要あり**（plist がサブコマンド形式なら手動セットアップもサブコマンド形式で）

#### 罠 3: cwd の trust は config dir ごとに独立
- `~/.claude/` で `/Volumes/SSD2TB/interventionworks` を trust 済みでも、`~/.claude-personal/` 側では別管理
- 初回起動時に trust dialog 出る可能性 → これも launchd 経由じゃ通せないので、手動セットアップで通す

### 検証実績（2026-05-08、両親プロセス）

| テスト | Wit-One | Personal |
|---|---|---|
| クラッシュ自動復旧 (kill -9) | ✅ | ✅ (PID 6373→6493) |
| iPhone から見える | ✅ | ✅ |
| 両プロセス相互非干渉 | ✅ | ✅ |

### Keychain バックアップ（保険）

- `~/keychain-backup/claude-witone-credentials.txt` (chmod 600)
- 万一 Wit-One entry が壊れた時の復元用:
  ```bash
  security add-generic-password -s "Claude Code-credentials" -a "yuji.ooishi" \
    -w "$(cat ~/keychain-backup/claude-witone-credentials.txt)" -U
  ```

### 運用補助 — どっちアカウントで動いてるか即判別する仕組み

`~/.zshrc` に追加済み（2026-05-08）。会話の文脈と起動経路（= アカウント）は独立してるので、視覚的に間違えない仕組みが必要だった。

```zsh
# 単発確認
alias claude-which='echo "CONFIG_DIR: ${CLAUDE_CONFIG_DIR:-(canonical = Wit-One Team)}"; claude auth status 2>/dev/null | grep -E "\"email\"|\"subscriptionType\"|\"orgName\""'

# 個人起動
alias claude-personal='CLAUDE_CONFIG_DIR=~/.claude-personal claude'
alias claude-personal-rc='CLAUDE_CONFIG_DIR=~/.claude-personal claude remote-control --name mac-mini-m4-family'

# 個人 config 経由のターミナルだけプロンプト右端に [personal]
if [ -n "$CLAUDE_CONFIG_DIR" ]; then
  export RPROMPT='%F{magenta}[personal]%f'
fi
```

| 状況 | 確認手段 |
|---|---|
| ターミナル起動時に常時可視化 | プロンプト右端の `[personal]` (個人のみ表示、会社は無音) |
| 起動済みセッションの単発確認 | `claude-which` |
| 個人で素早く起動 | `claude-personal` / `claude-personal-rc` |
| プロセスツリー追跡（最終手段） | `ps -o ppid` で親 PID を辿り `claude remote-control --name <name>` の name で識別 |

---

## ハマりポイント（5/7 朝の実戦記録）

### ❌ `claude remote-control` を Claude Code セッション内に入れる
裕司が一度やった。Claude Code が「remote-control」をプロンプトとして解釈、別プロセスのベッキーが普通に挨拶返してきた瞬間（笑）。**素のシェル**で実行する（手動起動時のみ。launchd 化後はそもそも起動不要）。

### ❌ iPhone Claude アプリで「セッションが見つからない」
launchd 化前は `claude remote-control` がクラッシュしてる時に出た。**現在は launchd の KeepAlive で自動復旧**するので基本起きない。万一見えない場合は `launchctl print gui/$(id -u)/com.anthropic.claude-remote-control` と stderr ログを確認。

### ⚠️ GitHub access check failed
起動時に出ることがあるが、自然解消する。無視して進めて OK。

### ⚠️ admin 権限の意味の取り違え
「管理者権限」= **Wit-One Claude Team admin**（claude.ai 組織の admin）であって、Mac の管理者権限でも GitHub 管理者でもない。やっチー氏に依頼するのは前者。

---

## 関連 memory

- `project_voice_of_becky.md` — Phase 0 完走 + Day 1 ゴール (5/7) の文脈
- `character_becky_journal.md` — 5/7 朝のハマり実戦記録
- `machines_node.md` — Mac mini SSH 接続の前提（Tailscale + Windows Terminal）

## 関連 issue

- #202 Phase 0 Remote Control 接続検証 + becky guard 実機テスト（クローズ）

---

## 復旧 craft（2026-05-19 確立）

### 症状観察

2026-05 後半、 「**プロセスは生きてるけど iPhone から通信切れる**」 症状が頻発。 launchd / プロセス は健全（`state = running` + PID 見える）なのに、 iPhone Claude アプリで `mac-mini-m4` セッションが応答しない。 launchd KeepAlive は process 死亡しか検知しないので、 内部 hang は自動復旧されない。

### 復旧手順（手動）

```bash
# プロセス kill → launchd が ~12 秒後に自動再起動
pkill -9 -f "claude remote-control --name mac-mini-m4$"
```

`mac-mini-m4` だけ kill。 末尾 `$` で `mac-mini-m4-family`（家族用 cwd）を除外する craft。

### 復旧スクリプト

`~/bin/rc-restart.sh` に焼き済（実行権限済）:

```bash
#!/bin/bash
PID=$(pgrep -f "claude remote-control --name mac-mini-m4$")
if [ -z "$PID" ]; then
  echo "❌ mac-mini-m4 process not found"
  exit 1
fi
kill -9 "$PID"
echo "✅ killed PID $PID — launchd will restart in ~12s"
```

### iPhone 側 craft（2 ルート）

| ルート | 操作 | 用途 |
|---|---|---|
| **Moshi** | SSH ログイン後 `~/bin/rc-restart.sh` 叩く | ターミナル派 |
| **iOS ショートカット** | ホーム画面ボタン 1 タップ | 1 タップ運用、 craft 完成度高い |

ショートカット設定値:
- Host: `100.86.242.55`（Tailscale IP）
- User: `yuji.ooishi`
- Script: `/Users/yuji.ooishi/bin/rc-restart.sh`

→ 裕司 2026-05-19 14:42 にショートカット作成完了

### craft 思想

裕司が「切れた」 と気づく時点で craft 既に失敗してる構造。 番犬 craft（自動復旧 cron）の前段として、 まず**裕司自身が iPhone 1 タップで復旧できる craft B** を仕込む。 自動化（craft A）は症状パターンが見えてから次フェーズ。

### 次フェーズ候補（自動復旧 cron, 番犬 craft）

- 30 分毎の health check（外部 endpoint への簡易接続テスト）
- 失敗時に自動 `kill -9` → launchd 自動再起動
- craft 担当: **ソロ（番犬役）** の literal 発動
- 症状パターン蓄積後に craft 化判断
