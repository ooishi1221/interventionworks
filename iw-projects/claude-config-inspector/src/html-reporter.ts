import type { ConfigSnapshot, FolderNode, MemoryTypeBreakdown } from './inspector.js';

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

export function generateHtml(snapshot: ConfigSnapshot): string {
  const score = snapshot.diagnostics.score;
  const scoreColor = score >= 80 ? '#4ade80' : score >= 50 ? '#facc15' : '#f87171';

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
  const permSection = perm.hasCustomPermissions
    ? `<div class="perm-grid">
        <div class="perm-box allow">
          <div class="perm-title">✅ 自動許可</div>
          ${perm.allowedTools.length
            ? perm.allowedTools.map(t => `<span class="perm-tag">${t}</span>`).join('')
            : '<span class="empty">なし</span>'}
        </div>
        <div class="perm-box deny">
          <div class="perm-title">🚫 拒否</div>
          ${perm.deniedTools.length
            ? perm.deniedTools.map(t => `<span class="perm-tag">${t}</span>`).join('')
            : '<span class="empty">なし</span>'}
        </div>
      </div>
      ${perm.bypassPermissions ? '<div class="gap-item gap-high">⚠️ bypassPermissions: true — 全ツールが自動許可</div>' : ''}`
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
    ? snapshot.skills.map(s =>
        `<tr><td><span class="badge badge-${s.source}">${s.source}</span></td><td><strong>/${s.name}</strong></td><td class="dim">${s.firstLine}</td></tr>`
      ).join('')
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
    ? snapshot.gaps.map((g, i) => `<div class="gap-item ${gapColor(i)}">${g}</div>`).join('')
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

header{display:flex;align-items:center;justify-content:space-between;margin-bottom:32px}
.header-left h1{font-size:22px;font-weight:700;color:#f8fafc}
.header-left .cwd{color:#64748b;font-size:11px;font-family:monospace;margin-top:4px}
.score-circle{width:72px;height:72px;border-radius:50%;border:3px solid ${scoreColor};display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0}
.score-num{font-size:22px;font-weight:700;color:${scoreColor}}
.score-label{font-size:9px;color:#64748b}

.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
.grid-full{grid-column:1/-1}
@media(max-width:700px){.grid{grid-template-columns:1fr}}

.card{background:#1e2433;border:1px solid #2d3748;border-radius:12px;padding:20px}
.card h2{font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px}

.kv{display:flex;gap:8px;align-items:baseline;margin-bottom:6px}
.kv-label{color:#64748b;font-size:12px;min-width:60px}
.kv-value{color:#e2e8f0;font-weight:500}

table{width:100%;border-collapse:collapse}
th{text-align:left;color:#64748b;font-size:11px;font-weight:500;padding:6px 8px;border-bottom:1px solid #2d3748}
td{padding:7px 8px;border-bottom:1px solid #1a2030;font-size:12px;vertical-align:top}
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
.perm-title{font-size:11px;color:#64748b;margin-bottom:8px}
.perm-tag{display:inline-block;background:#1a2030;color:#94a3b8;padding:2px 7px;border-radius:4px;font-size:11px;margin:2px;font-family:monospace}

/* gaps */
.gap-item{padding:9px 13px;border-radius:8px;margin-bottom:7px;font-size:12px}
.gap-high{background:#2d1b1b;border-left:3px solid #f87171;color:#fca5a5}
.gap-mid{background:#2d2510;border-left:3px solid #facc15;color:#fde68a}
.gap-low{background:#1b2d1b;border-left:3px solid #4ade80;color:#86efac}
.gap-ok{background:#1b2d1b;border-left:3px solid #4ade80;color:#86efac}

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

footer{margin-top:40px;text-align:center;color:#334155;font-size:11px}
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="header-left">
      <h1>Claude Config Inspector</h1>
      <div class="cwd">${snapshot.cwd}</div>
    </div>
    <div class="score-circle">
      <div class="score-num">${score}</div>
      <div class="score-label">SCORE</div>
    </div>
  </header>

  <div class="grid">

    <div class="card">
      <h2>Settings</h2>
      <div class="kv"><span class="kv-label">Model</span><span class="kv-value">${snapshot.settings.model}</span></div>
      <div class="kv"><span class="kv-label">TUI</span><span class="kv-value">${snapshot.settings.tui}</span></div>
    </div>

    <div class="card">
      <h2>改善できる箇所</h2>
      ${gapsSection}
    </div>

    <div class="card">
      <h2>MCP Servers (${snapshot.settings.mcpServers.length}個)</h2>
      <table>
        <tr><th>名前</th><th>タイプ</th><th>コマンド / URL</th></tr>
        ${mcpRows}
      </table>
    </div>

    <div class="card">
      <h2>Hooks (${snapshot.settings.hooks.length}個)</h2>
      <table>
        <tr><th>イベント</th><th>コマンド</th></tr>
        ${hookRows}
      </table>
    </div>

    <div class="card grid-full">
      <h2>Permissions</h2>
      ${permSection}
    </div>

    <div class="card grid-full">
      <h2>CLAUDE.md</h2>
      <table>
        <tr><th>種別</th><th>パス</th><th>行数</th><th>セクション</th><th>&lt;important&gt;</th><th>主要セクション</th></tr>
        ${mdRows}
      </table>
    </div>

    <div class="card">
      <h2>Skills (${snapshot.skills.length}個)</h2>
      <table>
        <tr><th>種別</th><th>コマンド</th><th>説明</th></tr>
        ${skillRows}
      </table>
    </div>

    <div class="card">
      <h2>Memory (${snapshot.memory.fileCount}件)</h2>
      ${memorySection}
    </div>

    <div class="card grid-full">
      <h2>Projects (${snapshot.projects.length}件) — ★ = 現在のプロジェクト</h2>
      <table>
        <tr><th>パス</th><th>memory件数</th><th>memory</th></tr>
        ${projectRows}
      </table>
    </div>

    <div class="card grid-full">
      <h2>DIAGNOSTICS (${diagItems.length}件) — Score: <span style="color:${scoreColor}">${score}</span></h2>
      ${diagSection}
    </div>

    <div class="card grid-full">
      <h2>フォルダ構成</h2>
      ${folderSections || '<p class="empty">取得できませんでした</p>'}
    </div>

  </div>
  <footer>claude-config-inspector v0.1.0 — ${new Date().toLocaleString('ja-JP')}</footer>
</div>
<script>
function toggleTree(el){const ul=el.nextElementSibling;if(ul)ul.classList.toggle('collapsed')}
</script>
</body>
</html>`;
}
