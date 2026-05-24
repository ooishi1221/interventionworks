---
name: macOS launchd TCC 制限と user dir 完結 craft
description: launchd は外部ボリューム（/Volumes/SSD2TB/ 等）からのスクリプト起動を TCC で block。user dir（~/）配下に物理 deploy する craft が必要。EnvironmentVariables / `--` 区切り / trap 制限の知見（2026-05-10 Voice of Becky x-tweet Phase 3 で発見）
type: reference
originSessionId: 6deedcc8-27b0-4059-b307-24058e11306b
---
# macOS launchd TCC 制限と user dir 完結 craft

2026-05-10 夜、Voice of Becky x-tweet Phase 3 自動発火 craft 実装中に発見した重要 knowledge。

## 症状

- launchd で plist load → 起動段階で **`Operation not permitted`** エラー
- exit code 78（`EX_CONFIG`）で fail
- **launchd 経由でだけ起こる**、user shell 直接実行では問題なし
- `/Volumes/SSD2TB/` 等の **外部ボリューム配下のスクリプト** を launchd から起動しようとすると発生

## 原因

macOS Sequoia 以降の TCC（Transparency, Consent, and Control）制限:
- launchd 自体が外部ボリュームへのアクセス権限を持たない
- **child process も TCC を継承**、wrapper 経由（launchd → `~/launcher.sh` → `exec /Volumes/...`）でも block

## 解決 craft（採用）

**user dir 配下に完全 deploy**:
- `~/iw-x-tweet/` 等の user dir に scripts + node_modules + .env + craft 参照ファイル全部コピー
- launchd plist の `ProgramArguments` を user dir 直接指定
- `StandardOutPath` / `StandardErrorPath` / `WorkingDirectory` も user dir 配下に

deploy 手順例（Voice of Becky x-tweet）:
```bash
cp -R /Volumes/SSD2TB/.../scripts ~/iw-x-tweet/
cp -R /Volumes/SSD2TB/.../node_modules ~/iw-x-tweet/
cp -R /Volumes/SSD2TB/.../src ~/iw-x-tweet/
cp /Volumes/SSD2TB/.../{package.json,package-lock.json,tsconfig.json,.env} ~/iw-x-tweet/
cp /Volumes/SSD2TB/.../{tone-examples.md,interaction-design.md,safety-guard.md,README.md} ~/iw-x-tweet/
```

## 副次的に発見した craft 知見

### 1. EnvironmentVariables 必須

launchd 起動の process は最小 PATH（`/usr/bin:/bin`）でしか起動しない。`claude` / `node` / `npx` 等を使う場合、plist に `EnvironmentVariables` で PATH 指定必須:

```xml
<key>EnvironmentVariables</key>
<dict>
    <key>PATH</key>
    <string>/Users/yuji.ooishi/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>/Users/yuji.ooishi</string>
</dict>
```

これは plist テンプレを動的生成する craft（generate-day-schedule.sh 等）でも忘れず入れる。

### 2. `claude --allowedTools` の variadic と `--` 区切り

`claude --print --allowedTools <tools...> "prompt"` の craft、`<tools...>` が variadic で **後続の prompt 引数を吸収**してしまう。エラー: `Error: Input must be provided either through stdin or as a prompt argument`。

修正: `--` で引数境界明示
```bash
claude --print --allowedTools "tool1,tool2,tool3" -- "prompt..."
```

または stdin 経由（heredoc）:
```bash
claude --print --allowedTools "..." <<'PROMPT'
prompt...
PROMPT
```

### 3. trap craft の launchd 経由不発

`trap cleanup EXIT` で self-unload を仕込んでも、launchd 経由起動では trap が動かない（仮説: launchd の SIGTERM/SIGKILL タイミング、または process 終了の検知が user shell と異なる）。

**user shell 直接実行では trap 動く**。launchd 経由でだけ不発、これ確認済（2026-05-10）。

回避 craft: 朝のクリーンアップ cron で前日 / 発火済み plist を全削除する craft で補正:
```bash
shopt -s nullglob
for plist in "$LAUNCHD_DIR"/com.*.impulse.*.plist; do
  launchctl unload "$plist" 2>/dev/null || true
  rm -f "$plist"
done
```

これで毎朝のスケジュール再生成時に古い plist が消える、self-unload 失敗を補正。

## 実装事例

`voice-of-becky/x-tweet/`:
- repo: `/Volumes/SSD2TB/interventionworks/voice-of-becky/x-tweet/`（git 管理、開発用）
- deploy: `~/iw-x-tweet/`（launchd 起動用、deploy で同期）
- launchd: `~/Library/LaunchAgents/com.iw.x-tweet.*.plist`

deploy 同期 craft（手動 or rsync）:
```bash
rsync -a --delete \
  --exclude=logs/ \
  --exclude=dist/ \
  /Volumes/SSD2TB/interventionworks/voice-of-becky/x-tweet/ \
  ~/iw-x-tweet/
```

## How to apply

- 今後 macOS launchd で外部ボリュームのスクリプトを起動する craft が必要な時、**最初から user dir deploy 前提で設計** する
- TCC エラーで時間溶かす craft 回避
- `~/Library/LaunchAgents/` の plist は **user dir 配下の path のみ** を指す原則
- `claude` / `node` 等を使う plist には EnvironmentVariables 必須
- `claude --print` + `--allowedTools` 系は `--` 区切りで prompt 渡す
- self-unload trap craft は launchd 経由で不発前提、朝のクリーンアップで補正

## 起源

2026-05-10 14:10、ベッキー X 自律発信第一弾の予約発火が exit 78 で失敗。

切り分け craft の流れ:
1. plist syntax / +x 権限 OK → 別問題
2. `Operation not permitted` 観察 → TCC 仮説
3. wrapper craft（`~/iw-x-tweet-launcher/launcher.sh` → `exec /Volumes/.../script.sh`）試行 → child も TCC 継承で fail
4. **完全 user dir deploy** 試行 → 成功
5. EnvironmentVariables 不足で `claude: command not found`
6. `--allowedTools` variadic で `Input must be provided`
7. trap craft 不発（朝クリーンアップで補正）
8. 14:44 ベッキー第二弾自律投稿成立（完全自動）

詳細: `voice-of-becky/x-tweet/phase3-spec.md` 末尾セクション参照
