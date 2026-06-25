import type { ConfigSnapshot, FolderNode, MemoryTypeBreakdown } from './inspector.js';

function buildUsageProfile(snapshot: ConfigSnapshot): { type: string; tags: string[]; summary: string } {
  const tags: string[] = [];
  const { settings, skills, memory, projects } = snapshot;
  const mcpNames = settings.mcpServers.map(s => s.name.toLowerCase());

  if (mcpNames.some(n => n.includes('stackchan'))) tags.push('🤖 ハードウェア連携');
  if (mcpNames.some(n => n.includes('telegram'))) tags.push('📱 Telegram 連携');
  if (mcpNames.some(n => n.includes('playwright'))) tags.push('🎭 ブラウザ自動化');
  if (mcpNames.some(n => n.includes('codex'))) tags.push('🧠 AI エージェント');
  if (mcpNames.some(n => n.includes('mem') || n.includes('memory'))) tags.push('💾 Memory 強化');
  if (settings.mcpServers.length >= 5) tags.push('🔌 MCP ヘビーユーザー');
  if (memory.fileCount > 150) tags.push('📚 大規模 Memory');
  if (memory.typeBreakdown.feedback > 50) tags.push('🔄 フィードバック蓄積型');
  if (skills.length > 10) tags.push('🎯 マルチロール運用');
  if (projects.length > 20) tags.push('🗂️ 大規模マルチプロジェクト');
  if (settings.hooks.length >= 3) tags.push('⚙️ フルオートメーション');
  else if (settings.hooks.length > 0) tags.push('🪝 Hooks 自動化');
  if (settings.permissions.bypassPermissions) tags.push('🔓 全自動許可');
  const totalLines = snapshot.claudeMds.reduce((sum, m) => sum + m.lineCount, 0);
  if (totalLines > 400) tags.push('📝 詳細 CLAUDE.md');

  const score = settings.mcpServers.length * 5
    + Math.min(memory.fileCount / 10, 20)
    + skills.length * 2
    + settings.hooks.length * 3
    + projects.length / 5;

  const type = score > 60
    ? '超上級者 / AI パイプライン構築者'
    : score > 40 ? '上級者 / 自動化ユーザー'
    : score > 20 ? '中級者 / カスタマイズユーザー'
    : '入門〜中級者';

  const parts: string[] = [];
  if (settings.mcpServers.length > 0) parts.push(`${settings.mcpServers.length} 本の MCP で外部ツール連携`);
  if (memory.fileCount > 0) parts.push(`${memory.fileCount} 件の Memory を長期蓄積`);
  if (skills.length > 0) parts.push(`${skills.length} 個のスキルでロール分業`);
  if (projects.length > 10) parts.push(`${projects.length} プロジェクトを横断管理`);
  const summary = parts.join('、') + (parts.length ? '。' : '');

  return { type, tags, summary };
}

function renderFolderHtml(nodes: FolderNode[], depth = 0): string {
  return nodes.map((node) => {
    const icon = node.type === 'dir' ? '📁' : '📄';
    const note = node.note ? `<span class="tree-note"> ← ${node.note}</span>` : '';
    const hasChildren = (node.children?.length ?? 0) > 0;
    const children = hasChildren ? `<ul class="tree-children">${renderFolderHtml(node.children!, depth + 1)}</ul>` : '';
    return `<li class="tree-item ${node.type}">
      <span class="tree-label ${hasChildren ? 'has-children' : ''}" ${hasChildren ? 'onclick="toggleTree(this)"' : ''}>
        ${icon} <span class="tree-name">${node.name}</span>${note}
      </span>${children}
    </li>`;
  }).join('');
}

function typeBar(breakdown: MemoryTypeBreakdown, total: number): string {
  if (total === 0) return '<span class="empty">ファイルなし</span>';
  const types: Array<[keyof MemoryTypeBreakdown, string, string]> = [
    ['user',     '#60a5fa', 'user'],
    ['feedback', '#f472b6', 'feedback'],
    ['project',  '#4ade80', 'project'],
    ['reference','#facc15', 'reference'],
    ['unknown',  '#475569', '?'],
  ];
  const bars = types
    .filter(([k]) => breakdown[k] > 0)
    .map(([k, color, label]) => {
      const pct = Math.round((breakdown[k] / total) * 100);
      return `<div class="bar-seg" style="width:${pct}%;background:${color}" title="${label}: ${breakdown[k]}件 (${pct}%)"></div>`;
    }).join('');
  const legend = types
    .filter(([k]) => breakdown[k] > 0)
    .map(([k, color, label]) =>
      `<span class="leg-item"><span class="leg-dot" style="background:${color}"></span>${label}: <strong>${breakdown[k]}</strong></span>`
    ).join('');
  return `<div class="type-bar">${bars}</div><div class="type-legend">${legend}</div>`;
}

function gapColor(i: number): string {
  return i < 2 ? 'gap-high' : i < 4 ? 'gap-mid' : 'gap-low';
}

const gapTips: Record<string, { howTo: string; link: string; linkLabel: string }> = {
  'MCP サーバーが未設定': {
    howTo: 'ターミナルで <code>claude mcp add &lt;name&gt; &lt;command&gt;</code> を実行すると追加できます',
    link: 'https://docs.anthropic.com/ja/docs/claude-code/mcp',
    linkLabel: 'MCP ドキュメント →',
  },
  'Hooks が未設定': {
    howTo: '<code>~/.claude/settings.json</code> の <code>hooks</code> キーにシェルコマンドを定義します。ツール実行前後に自動でスクリプトを走らせられます',
    link: 'https://docs.anthropic.com/ja/docs/claude-code/hooks',
    linkLabel: 'Hooks ドキュメント →',
  },
  'ユーザーレベル CLAUDE.md がない': {
    howTo: '<code>~/.claude/CLAUDE.md</code> を作成するだけ。使用言語・モデルの好み・チームのルールなど全プロジェクト共通の指示を書けます',
    link: 'https://docs.anthropic.com/ja/docs/claude-code/memory#claudemd-files',
    linkLabel: 'CLAUDE.md ドキュメント →',
  },
  'Skills がない': {
    howTo: '<code>~/.claude/skills/</code> に Markdown ファイルを置くだけで <code>/コマンド</code> になります。よく使うプロンプトを登録しておくと便利',
    link: 'https://docs.anthropic.com/ja/docs/claude-code/slash-commands',
    linkLabel: 'Skills ドキュメント →',
  },
  'Memory が未初期化': {
    howTo: '<code>~/.claude/projects/&lt;project&gt;/memory/</code> ディレクトリを作成して <code>.md</code> ファイルを置くと会話をまたいで記憶が使えます',
    link: 'https://docs.anthropic.com/ja/docs/claude-code/memory',
    linkLabel: 'Memory ドキュメント →',
  },
};

export function generateHtml(snapshot: ConfigSnapshot): string {

  // Settings
  const mcpRows = snapshot.settings.mcpServers.length
    ? snapshot.settings.mcpServers.map(s =>
        `<tr><td>${s.name}</td><td><span class="badge badge-type">${s.type}</span></td><td class="mono">${s.command ?? s.url ?? ''}</td></tr>`
      ).join('')
    : '<tr><td colspan="3" class="empty">未設定</td></tr>';

  const hookRows = snapshot.settings.hooks.length
    ? snapshot.settings.hooks.map(h =>
        `<tr><td><span class="badge badge-hook">${h.event}</span></td><td>${h.matchers.join('<br>')}</td></tr>`
      ).join('')
    : '<tr><td colspan="2" class="empty">未設定</td></tr>';

  // Permissions
  const perm = snapshot.settings.permissions;

  type CatDef = { label: string; test: (t: string) => boolean; suggest?: string };
  const permCategories: CatDef[] = [
    { label: 'git（特定パス付き）', test: t => /^Bash\(git -C /.test(t), suggest: 'Bash(git *)' },
    { label: 'git（サブコマンド別）', test: t => /^Bash\(git /.test(t) && !/-C /.test(t) && !/\*$/.test(t.replace(/\(.*\)/,'')), suggest: 'Bash(git *)' },
    { label: 'curl（個別URL）', test: t => /^Bash\(curl/.test(t) && !/\*/.test(t), suggest: 'Bash(curl *)' },
    { label: 'echo（exit code確認）', test: t => /^Bash\(echo/.test(t), suggest: 'Bash(echo *)' },
    { label: 'kill / pkill（個別）', test: t => /^Bash\((kill|pkill|killall)/.test(t) && !/\*/.test(t), suggest: 'Bash(pkill -f *)' },
    { label: 'python3（個別コマンド）', test: t => /^Bash\(python3?/.test(t) && !/\*/.test(t), suggest: 'Bash(python3 *)' },
    { label: 'venv / pip（個別）', test: t => /\.(venv|bin\/pip|bin\/python)/.test(t) && !/\*/.test(t), suggest: 'Bash(.venv/bin/* )' },
    { label: 'cp / mv（個別パス）', test: t => /^Bash\((cp|mv) /.test(t) && !/\*/.test(t), suggest: 'Bash(cp *)  Bash(mv *)' },
    { label: 'rm（個別パス）', test: t => /^Bash\(rm /.test(t) && !/\*/.test(t), suggest: 'Bash(rm *)' },
    { label: 'mkdir（個別パス）', test: t => /^Bash\(mkdir/.test(t) && !/\*/.test(t), suggest: 'Bash(mkdir *)' },
    { label: 'WebFetch（ドメイン別）', test: t => /^WebFetch\(domain:/.test(t), suggest: 'WebFetch(*)' },
    { label: 'ffmpeg（個別）', test: t => /^Bash\(ffmpeg/.test(t) && !/\*/.test(t), suggest: 'Bash(ffmpeg *)' },
    { label: 'export PATH（個別）', test: t => /^Bash\(export PATH/.test(t) && !/\*/.test(t), suggest: '→ Bash(export PATH=*) で代替可' },
    { label: 'awk（特定ファイルパス）', test: t => /^Bash\(awk.*\/Volumes/.test(t), suggest: '一時ファイル名を変数化' },
    { label: 'mcp__（ツール別）', test: t => /^mcp__/.test(t) },
    { label: 'npm / npx（個別）', test: t => /^Bash\((npm|npx)/.test(t) && !/\*/.test(t), suggest: '主要コマンドはワイルドカード化済み' },
    { label: 'ワイルドカード（既存）', test: t => /\*/.test(t) },
    { label: 'その他', test: () => true },
  ];
  type CatResult = { label: string; count: number; suggest?: string };
  const permCatResults: CatResult[] = [];
  const counted = new Set<number>();
  for (const cat of permCategories) {
    const items = perm.allowedTools.filter((t, i) => !counted.has(i) && cat.test(t));
    items.forEach((_, j) => {
      const idx = perm.allowedTools.indexOf(items[j]);
      counted.add(idx);
    });
    if (items.length > 0) permCatResults.push({ label: cat.label, count: items.length, suggest: cat.suggest });
  }
  const consolidatable = permCatResults.filter(c => c.suggest && !c.label.includes('ワイルドカード')).reduce((s, c) => s + c.count, 0);
  const permConsolidateHtml = `<div class="perm-consolidate">
    <div class="perm-consolidate-title" onclick="this.nextElementSibling.classList.toggle('open')">
      📊 カテゴリ別内訳（整理提案）▾
    </div>
    <div class="perm-consolidate-body">
      ${permCatResults.map(c => `<div class="perm-cat-row">
        <span class="perm-cat-name">${c.label}</span>
        <span class="perm-cat-count">${c.count}件</span>
        ${c.suggest ? `<span class="perm-cat-suggest">${c.suggest}</span>` : ''}
      </div>`).join('')}
      ${consolidatable > 0 ? `<div class="perm-suggest-box" style="margin-top:10px">
        💡 ワイルドカードに統合で約 <strong>${consolidatable}件 → 数件</strong> に削減可能。
        <code>~/.claude/settings.json</code> の <code>allowedTools</code> を手動編集してください。
      </div>` : ''}
    </div>
  </div>`;

  const permSection = perm.hasCustomPermissions
    ? `<div class="perm-grid">
        <div class="perm-box allow">
          <div class="perm-title">✅ 自動許可 <span class="perm-count">${perm.allowedTools.length}件</span></div>
          <div class="perm-tags-scroll">
            ${perm.allowedTools.length
              ? perm.allowedTools.map(t => `<span class="perm-tag">${t}</span>`).join('')
              : '<span class="empty">なし</span>'}
          </div>
        </div>
        <div class="perm-box deny">
          <div class="perm-title">🚫 拒否 <span class="perm-count" style="background:#3a1e1e;color:#f87171">${perm.deniedTools.length}件</span></div>
          <div class="perm-tags-scroll">
            ${perm.deniedTools.length
              ? perm.deniedTools.map(t => `<span class="perm-tag">${t}</span>`).join('')
              : '<span class="empty">なし</span>'}
          </div>
        </div>
      </div>
      ${permConsolidateHtml}
      ${perm.bypassPermissions ? '<div class="gap-item gap-high" style="margin-top:8px">⚠️ bypassPermissions: true — 全ツールが自動許可</div>' : ''}`
    : '<p class="empty">カスタム設定なし（全ツール: 確認プロンプトあり）</p>';

  // CLAUDE.md
  const mdRows = snapshot.claudeMds.length
    ? snapshot.claudeMds.map(m =>
        `<tr>
          <td><span class="badge badge-${m.source}">${m.source}</span></td>
          <td class="mono">${m.path}</td>
          <td class="num">${m.lineCount}</td>
          <td class="num">${m.structure.sectionCount}</td>
          <td class="num">${m.structure.importantCount}</td>
          <td class="sections">${m.structure.topSections.map(s => `<span class="section-tag">${s}</span>`).join('')}</td>
        </tr>`
      ).join('')
    : '<tr><td colspan="6" class="empty">なし</td></tr>';

  // Skills
  const skillRows = snapshot.skills.length
    ? snapshot.skills.map(s => {
        const desc = s.description ?? s.firstLine;
        return `<tr><td><span class="badge badge-${s.source}">${s.source}</span></td><td><strong>/${s.name}</strong></td><td class="dim">${desc}</td></tr>`;
      }).join('')
    : '<tr><td colspan="3" class="empty">なし</td></tr>';

  // Memory
  const { memory } = snapshot;
  const memorySection = memory.exists
    ? `<div class="memory-stats">
        <div class="stat-box"><div class="stat-num">${memory.fileCount}</div><div class="stat-label">総ファイル数</div></div>
        <div class="stat-box"><div class="stat-num">${memory.indexExists ? '✓' : '✗'}</div><div class="stat-label">MEMORY.md</div></div>
        <div class="stat-box"><div class="stat-num">${memory.typeBreakdown.feedback}</div><div class="stat-label">feedback</div></div>
        <div class="stat-box"><div class="stat-num">${memory.typeBreakdown.user}</div><div class="stat-label">user</div></div>
      </div>
      <div class="type-section">
        ${typeBar(memory.typeBreakdown, memory.fileCount)}
      </div>
      ${memory.indexEntries.length ? `<ul class="memory-list">${memory.indexEntries.slice(0, 12).map(e => `<li>${e}</li>`).join('')}${memory.indexEntries.length > 12 ? `<li class="dim">...他 ${memory.indexEntries.length - 12}件</li>` : ''}</ul>` : ''}`
    : `<p class="empty">未初期化 — <span class="mono">${memory.dir}</span></p>`;

  // Projects
  const projectRows = snapshot.projects.length
    ? snapshot.projects.map(p =>
        `<tr class="${p.isCurrent ? 'current-project' : ''}">
          <td>${p.isCurrent ? '★ ' : ''}<span class="mono dim">${p.decodedPath}</span></td>
          <td class="num">${p.hasMemory ? p.memoryFileCount : '—'}</td>
          <td>${p.hasMemory ? '<span class="badge badge-project">あり</span>' : '<span class="badge badge-none">なし</span>'}</td>
        </tr>`
      ).join('')
    : '<tr><td colspan="3" class="empty">プロジェクトなし</td></tr>';

  // Gaps
  const gapsSection = snapshot.gaps.length
    ? snapshot.gaps.map((g, i) => {
        const tipKey = Object.keys(gapTips).find(k => g.includes(k));
        const tip = tipKey ? gapTips[tipKey] : null;
        const tipHtml = tip
          ? `<div class="gap-howto">💡 ${tip.howTo}</div>
             <a class="gap-link" href="${tip.link}" target="_blank" rel="noopener">${tip.linkLabel}</a>`
          : '';
        return `<div class="gap-item ${gapColor(i)}">${g}${tipHtml}</div>`;
      }).join('')
    : '<div class="gap-item gap-ok">✅ 設定は充実しています</div>';

  // Diagnostics
  const diagItems = snapshot.diagnostics.items;
  const diagSection = diagItems.length === 0
    ? '<div class="diag-item diag-ok">✅ 診断上の問題はありません</div>'
    : diagItems.map((item) => {
        const icon = item.severity === 'error' ? '🔴' : item.severity === 'warn' ? '🟡' : '🔵';
        const cls = item.severity === 'error' ? 'diag-error' : item.severity === 'warn' ? 'diag-warn' : 'diag-info';
        const suggestion = item.suggestion
          ? `<div class="diag-suggestion">→ ${item.suggestion}</div>`
          : '';
        return `<div class="diag-item ${cls}">
          <div class="diag-header">
            <span class="diag-icon">${icon}</span>
            <span class="diag-cat">${item.category}</span>
            <span class="diag-title">${item.title}</span>
          </div>
          <div class="diag-detail">${item.detail}</div>
          ${suggestion}
        </div>`;
      }).join('');

  // Usage profile
  const profile = buildUsageProfile(snapshot);
  const usageSection = `
    <div class="profile-type">${profile.type}</div>
    ${profile.summary ? `<p class="profile-summary">${profile.summary}</p>` : ''}
    <div class="profile-tags">${profile.tags.map(t => `<span class="profile-tag">${t}</span>`).join('')}</div>`;

  // Folder tree
  const folderSections = snapshot.folderTree.map(root => `
    <div class="folder-root">
      <div class="folder-root-label">📁 ${root.name}</div>
      <ul class="tree-root">${root.children ? renderFolderHtml(root.children) : ''}</ul>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Claude Config Inspector</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f1117;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.6}
.container{max-width:1140px;margin:0 auto;padding:32px 24px}

header{display:grid;grid-template-columns:1fr auto;align-items:center;gap:20px;margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #1e2a3a}
.header-left h1{font-size:20px;font-weight:700;color:#f8fafc;letter-spacing:-.01em}
.header-left .cwd-row{display:flex;align-items:center;gap:6px;margin-top:5px}
.header-left .cwd{color:#475569;font-size:11px;font-family:monospace}
.copy-cwd{background:none;border:none;color:#334155;cursor:pointer;padding:2px 4px;border-radius:3px;font-size:11px;transition:color .15s;line-height:1}
.copy-cwd:hover{color:#94a3b8}
.header-actions{display:flex;flex-direction:column;gap:7px;align-items:flex-end}
.folder-btn{background:#1e2433;border:1px solid #2d3748;color:#94a3b8;border-radius:7px;padding:6px 12px;font-size:12px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:5px;transition:all .15s;white-space:nowrap}
.folder-btn:hover{background:#2d3748;color:#e2e8f0;border-color:#475569}
.folder-btn .copied{color:#4ade80}
.pdf-action{background:#1e2433;border:1px solid #2d3748;color:#64748b;border-radius:7px;padding:6px 12px;font-size:12px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:5px;transition:all .15s}
.pdf-action:hover{background:#2d3748;color:#94a3b8}

.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
.grid-full{grid-column:1/-1}
@media(max-width:700px){.grid{grid-template-columns:1fr}}

.card{background:#161d2b;border:1px solid #1e2a3a;border-radius:10px;padding:20px;transition:border-color .2s}
.card:hover{border-color:#2d3d55}
.card h2{font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid #1e2a3a}

.kv{display:flex;gap:8px;align-items:baseline;margin-bottom:6px}
.kv-label{color:#64748b;font-size:12px;min-width:60px}
.kv-value{color:#e2e8f0;font-weight:500}

table{width:100%;border-collapse:collapse}
th{text-align:left;color:#475569;font-size:10px;font-weight:600;padding:6px 8px;border-bottom:1px solid #1e2a3a;letter-spacing:.05em;text-transform:uppercase}
td{padding:7px 8px;border-bottom:1px solid #111827;font-size:12px;vertical-align:top}
tr:hover td{background:#1a2535}
.num{text-align:right;color:#94a3b8}
.dim{color:#64748b}
.sections{display:flex;flex-wrap:wrap;gap:4px}
.empty{color:#4a5568;font-style:italic}
.mono{font-family:monospace;font-size:11px;color:#94a3b8;word-break:break-all}
.current-project td{background:#1a2535}

.badge{display:inline-block;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase}
.badge-user{background:#1e3a5f;color:#60a5fa}
.badge-project{background:#1e3a2f;color:#4ade80}
.badge-parent{background:#2d2d1e;color:#facc15}
.badge-type{background:#1e2a3a;color:#94a3b8}
.badge-hook{background:#2d1e3a;color:#c084fc}
.badge-none{background:#1e2433;color:#4a5568}
.section-tag{display:inline-block;background:#1a2030;color:#94a3b8;padding:1px 6px;border-radius:3px;font-size:10px;margin:1px}

/* memory */
.memory-stats{display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.stat-box{background:#161b27;border:1px solid #2d3748;border-radius:8px;padding:10px 16px;text-align:center;min-width:70px}
.stat-num{font-size:26px;font-weight:700;color:#60a5fa}
.stat-label{font-size:10px;color:#64748b}
.type-section{margin-bottom:12px}
.type-bar{display:flex;height:10px;border-radius:5px;overflow:hidden;margin-bottom:6px}
.bar-seg{height:100%;transition:width .3s}
.type-legend{display:flex;flex-wrap:wrap;gap:10px}
.leg-item{display:flex;align-items:center;gap:4px;font-size:11px;color:#94a3b8}
.leg-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.memory-list{padding-left:16px;color:#94a3b8;font-size:12px}
.memory-list li{margin-bottom:3px}

/* permissions */
.perm-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px}
.perm-box{background:#161b27;border:1px solid #2d3748;border-radius:8px;padding:12px}
.perm-box.allow{border-color:#1e3a2f}
.perm-box.deny{border-color:#3a1e1e}
.perm-title{font-size:11px;color:#64748b;margin-bottom:8px;display:flex;align-items:center;gap:6px}
.perm-count{background:#1e3a2f;color:#4ade80;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700}
.perm-tags-scroll{max-height:220px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#2d3748 transparent}
.perm-tags-scroll::-webkit-scrollbar{width:4px}
.perm-tags-scroll::-webkit-scrollbar-track{background:transparent}
.perm-tags-scroll::-webkit-scrollbar-thumb{background:#2d3748;border-radius:2px}
.perm-tag{display:inline-block;background:#1a2030;color:#94a3b8;padding:2px 7px;border-radius:4px;font-size:11px;margin:2px;font-family:monospace}
.perm-consolidate{margin-top:14px;border-top:1px solid #2d3748;padding-top:12px}
.perm-consolidate-title{font-size:11px;color:#64748b;margin-bottom:10px;cursor:pointer;display:flex;align-items:center;gap:4px;user-select:none}
.perm-consolidate-title:hover{color:#94a3b8}
.perm-consolidate-body{display:none}
.perm-consolidate-body.open{display:block}
.perm-cat-row{display:flex;align-items:baseline;justify-content:space-between;padding:5px 0;border-bottom:1px solid #1a2030;font-size:11px}
.perm-cat-name{color:#94a3b8;flex:1}
.perm-cat-count{color:#64748b;min-width:36px;text-align:right}
.perm-cat-suggest{color:#4ade80;font-size:10px;font-family:monospace;margin-left:10px}
.perm-suggest-box{margin-top:10px;background:#161b27;border:1px solid #1e3a2f;border-radius:6px;padding:10px;font-size:11px;color:#86efac}
.perm-suggest-box code{background:#1a2030;padding:1px 5px;border-radius:3px;font-family:monospace;font-size:11px;color:#67e8f9}

/* gaps */
.gap-item{padding:9px 13px;border-radius:8px;margin-bottom:7px;font-size:12px}
.gap-high{background:#2d1b1b;border-left:3px solid #f87171;color:#fca5a5}
.gap-mid{background:#2d2510;border-left:3px solid #facc15;color:#fde68a}
.gap-low{background:#1b2d1b;border-left:3px solid #4ade80;color:#86efac}
.gap-ok{background:#1b2d1b;border-left:3px solid #4ade80;color:#86efac}

/* gap tips */
.gap-howto{margin-top:5px;font-size:11px;color:#94a3b8;opacity:.85;line-height:1.5}
.gap-howto code{background:#1a2030;padding:1px 5px;border-radius:3px;font-family:monospace;font-size:11px;color:#67e8f9}
.gap-link{display:inline-block;margin-top:5px;font-size:11px;color:#60a5fa;text-decoration:none;opacity:.8}
.gap-link:hover{opacity:1;text-decoration:underline}

/* folder tree */
.folder-root{margin-bottom:20px}
.folder-root-label{font-weight:600;color:#94a3b8;margin-bottom:8px;font-size:12px}
ul.tree-root,ul.tree-children{list-style:none;padding-left:0}
ul.tree-children{padding-left:18px}
.tree-item{margin:2px 0}
.tree-label{display:inline-flex;align-items:baseline;gap:4px;font-size:11px;font-family:monospace;cursor:default}
.tree-label.has-children{cursor:pointer}
.tree-label.has-children:hover .tree-name{color:#60a5fa}
.tree-name{color:#e2e8f0}
.tree-note{color:#4a5568;font-size:10px}
.tree-children.collapsed{display:none}

/* diagnostics */
.diag-item{padding:9px 13px;border-radius:8px;margin-bottom:7px;font-size:12px}
.diag-error{background:#2d1b1b;border-left:3px solid #f87171}
.diag-warn{background:#2d2510;border-left:3px solid #facc15}
.diag-info{background:#1b243d;border-left:3px solid #60a5fa}
.diag-ok{background:#1b2d1b;border-left:3px solid #4ade80;color:#86efac}
.diag-header{display:flex;align-items:center;gap:6px;margin-bottom:3px}
.diag-icon{font-size:13px;flex-shrink:0}
.diag-cat{display:inline-block;padding:1px 7px;border-radius:4px;font-size:9px;font-weight:700;text-transform:uppercase;background:#1a2030;color:#94a3b8}
.diag-title{font-weight:600;color:#e2e8f0}
.diag-detail{color:#94a3b8;font-size:11px;padding-left:22px}
.diag-suggestion{color:#64748b;font-size:11px;padding-left:22px;margin-top:2px}


/* nav bar */
.nav-bar{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:24px;padding:10px 12px;background:#111827;border:1px solid #1e2a3a;border-radius:8px}
.nav-bar a{display:inline-block;padding:4px 10px;border-radius:5px;font-size:11px;color:#64748b;text-decoration:none;font-weight:500;transition:background .15s,color .15s}
.nav-bar a:hover{background:#1e2a3a;color:#cbd5e1}

/* collapsible cards */
.card-header{display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;margin-bottom:0;padding-bottom:10px;border-bottom:1px solid #1e2a3a}
.card-header:hover .collapse-icon{color:#94a3b8}
.collapse-icon{font-size:10px;color:#334155;transition:transform .2s}
.collapse-icon.open{transform:rotate(180deg)}
.card-body{margin-top:14px}
.card-body.hidden{display:none}

/* usage profile */
.profile-type{font-size:18px;font-weight:700;color:#f0abfc;margin-bottom:8px}
.profile-summary{font-size:13px;color:#94a3b8;margin-bottom:14px;line-height:1.7}
.profile-tags{display:flex;flex-wrap:wrap;gap:7px}
.profile-tag{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:500;background:#1e2433;border:1px solid #3b3f5c;color:#c4b5fd}

footer{margin-top:32px;text-align:center;color:#1e2a3a;font-size:11px;padding-bottom:24px}

@media print{
  body{background:#fff;color:#1a1a1a}
  .header-actions,.nav-bar,.copy-cwd{display:none}
  .card{background:#f8f9fa;border:1px solid #dee2e6}
  .card h2{color:#495057}
  .mono{color:#495057}
  .empty{color:#6c757d}
  .dim{color:#6c757d}
  .badge-user{background:#dbeafe;color:#1e40af}
  .badge-project{background:#dcfce7;color:#166534}
  .badge-parent{background:#fef9c3;color:#854d0e}
  th{color:#495057;border-bottom-color:#dee2e6}
  td{border-bottom-color:#f1f3f5}
  .stat-box{background:#f1f5f9;border-color:#dee2e6}
  .stat-num{color:#3b82f6}
  .memory-list li{color:#495057}
  .type-legend .leg-item{color:#495057}
  .section-tag{background:#f1f5f9;color:#495057}
  .perm-box{background:#f8fafc;border-color:#dee2e6}
  .perm-tag{background:#f1f5f9;color:#495057}
  .gap-high{background:#fee2e2;color:#991b1b}
  .gap-mid{background:#fef9c3;color:#854d0e}
  .gap-low,.gap-ok{background:#dcfce7;color:#166534}
  .diag-error{background:#fee2e2}
  .diag-warn{background:#fef9c3}
  .diag-info{background:#dbeafe}
  .diag-ok{background:#dcfce7}
  .diag-title{color:#1a1a1a}
  .diag-detail{color:#495057}
  .diag-suggestion{color:#6c757d}
  .diag-cat{background:#f1f5f9;color:#495057}
  .folder-root-label{color:#495057}
  .tree-name{color:#1a1a1a}
  .tree-note{color:#6c757d}
  .header-left h1{color:#1a1a1a}
  .header-left .cwd{color:#6c757d}
  .current-project td{background:#f0fdf4}
}
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="header-left">
      <h1>Claude Config Inspector</h1>
      <div class="cwd-row">
        <span class="cwd">${snapshot.cwd}</span>
        <button class="copy-cwd" onclick="copyPath()" title="パスをコピー">📋</button>
      </div>
    </div>
    <div class="header-actions">
      <button class="folder-btn" onclick="copyPath()" id="folderBtn">
        <span>📁</span><span id="folderBtnLabel">フォルダパスをコピー</span>
      </button>
      <button class="pdf-action" onclick="window.print()">📄 PDF として保存</button>
    </div>
  </header>

  <nav class="nav-bar">
    <a href="#analysis">🧭 使い方分析</a>
    <a href="#diag">🔍 Diagnostics</a>
    <a href="#settings">⚙️ Settings</a>
    <a href="#mcp">🔌 MCP</a>
    <a href="#hooks">🪝 Hooks</a>
    <a href="#permissions">🔐 Permissions</a>
    <a href="#claudemd">📄 CLAUDE.md</a>
    <a href="#skills">🎯 Skills</a>
    <a href="#memory">🧠 Memory</a>
    <a href="#projects">🗂️ Projects</a>
    <a href="#folder">📁 フォルダ構成</a>
  </nav>

  <div class="grid">

    <div class="card grid-full" id="analysis">
      <h2>使い方分析</h2>
      ${usageSection}
    </div>

    <div class="card grid-full" id="diag">
      <h2>DIAGNOSTICS (${diagItems.length}件)</h2>
      ${diagSection}
    </div>

    <div class="card" id="settings">
      <h2>Settings</h2>
      <div class="kv"><span class="kv-label">Model</span><span class="kv-value">${snapshot.settings.model}</span></div>
      <div class="kv"><span class="kv-label">TUI</span><span class="kv-value">${snapshot.settings.tui}</span></div>
    </div>

    <div class="card">
      <h2>改善できる箇所</h2>
      ${gapsSection}
    </div>

    <div class="card" id="mcp">
      <h2>MCP Servers (${snapshot.settings.mcpServers.length}個)</h2>
      <table>
        <tr><th>名前</th><th>タイプ</th><th>コマンド / URL</th></tr>
        ${mcpRows}
      </table>
    </div>

    <div class="card" id="hooks">
      <h2>Hooks (${snapshot.settings.hooks.length}個)</h2>
      <table>
        <tr><th>イベント</th><th>コマンド</th></tr>
        ${hookRows}
      </table>
    </div>

    <div class="card grid-full" id="permissions">
      <h2>Permissions</h2>
      ${permSection}
    </div>

    <div class="card grid-full" id="claudemd">
      <h2>CLAUDE.md</h2>
      <table>
        <tr><th>種別</th><th>パス</th><th>行数</th><th>セクション</th><th>&lt;important&gt;</th><th>主要セクション</th></tr>
        ${mdRows}
      </table>
    </div>

    <div class="card grid-full" id="skills">
      <h2>Skills (${snapshot.skills.length}個)</h2>
      <table>
        <tr><th>種別</th><th>コマンド</th><th>説明</th></tr>
        ${skillRows}
      </table>
    </div>

    <div class="card grid-full" id="memory">
      <h2>Memory (${snapshot.memory.fileCount}件)</h2>
      ${memorySection}
    </div>

    <div class="card grid-full" id="projects">
      <h2 class="card-header" onclick="toggleCard(this)">
        Projects (${snapshot.projects.length}件) — ★ = 現在のプロジェクト
        <span class="collapse-icon">▼</span>
      </h2>
      <div class="card-body hidden">
        <table>
          <tr><th>パス</th><th>memory件数</th><th>memory</th></tr>
          ${projectRows}
        </table>
      </div>
    </div>

    <div class="card grid-full" id="folder">
      <h2 class="card-header" onclick="toggleCard(this)">
        フォルダ構成
        <span class="collapse-icon">▼</span>
      </h2>
      <div class="card-body hidden">
        ${folderSections || '<p class="empty">取得できませんでした</p>'}
      </div>
    </div>

  </div>
  <footer>claude-config-inspector v0.1.0 — ${new Date().toLocaleString('ja-JP')}</footer>
</div>
<script>
function toggleTree(el){const ul=el.nextElementSibling;if(ul)ul.classList.toggle('collapsed')}
function toggleCard(h2){const body=h2.nextElementSibling;const icon=h2.querySelector('.collapse-icon');if(body){body.classList.toggle('hidden');icon.classList.toggle('open');}}
function copyPath(){
  const p='${snapshot.cwd.replace(/'/g, "\\'")}';
  navigator.clipboard.writeText(p).then(()=>{
    const lb=document.getElementById('folderBtnLabel');
    if(lb){lb.textContent='コピーしました ✓';lb.parentElement.style.color='#4ade80';lb.parentElement.style.borderColor='#166534';setTimeout(()=>{lb.textContent='フォルダパスをコピー';lb.parentElement.style.color='';lb.parentElement.style.borderColor='';},2000);}
  });
}
</script>
</body>
</html>`;
}
