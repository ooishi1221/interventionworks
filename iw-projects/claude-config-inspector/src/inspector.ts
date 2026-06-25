import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── interfaces ───────────────────────────────────────────────

export interface McpServer {
  name: string;
  type: string;
  command?: string;
  url?: string;
}

export interface HookEntry {
  event: string;
  matchers: string[];
}

export interface SkillInfo {
  name: string;
  source: 'user' | 'project';
  firstLine: string;
  description: string | null;
}

export interface ClaudeMdStructure {
  sectionCount: number;
  importantCount: number;
  topSections: string[];
}

export interface ClaudeMdInfo {
  path: string;
  source: 'user' | 'project' | 'parent';
  lineCount: number;
  sizeKb: number;
  structure: ClaudeMdStructure;
}

export interface MemoryTypeBreakdown {
  user: number;
  feedback: number;
  project: number;
  reference: number;
  unknown: number;
}

export interface MemoryInfo {
  dir: string | null;
  exists: boolean;
  fileCount: number;
  indexExists: boolean;
  indexEntries: string[];
  typeBreakdown: MemoryTypeBreakdown;
}

export interface PermissionsInfo {
  allowedTools: string[];
  deniedTools: string[];
  bypassPermissions: boolean;
  hasCustomPermissions: boolean;
}

export interface ProjectEntry {
  encodedName: string;
  decodedPath: string;
  hasMemory: boolean;
  memoryFileCount: number;
  isCurrent: boolean;
}

export interface SettingsSnapshot {
  model: string;
  tui: string;
  mcpServers: McpServer[];
  hooks: HookEntry[];
  permissions: PermissionsInfo;
  rawKeys: string[];
}

export interface FolderNode {
  name: string;
  type: 'dir' | 'file';
  children?: FolderNode[];
  note?: string;
}

export interface DiagnosticItem {
  severity: 'error' | 'warn' | 'info';
  category: 'context' | 'mcp' | 'hooks' | 'memory' | 'skills';
  title: string;
  detail: string;
  suggestion?: string;
}

export interface DiagnosticReport {
  items: DiagnosticItem[];
  score: number;
}

export interface ConfigSnapshot {
  cwd: string;
  settings: SettingsSnapshot;
  claudeMds: ClaudeMdInfo[];
  skills: SkillInfo[];
  memory: MemoryInfo;
  projects: ProjectEntry[];
  folderTree: FolderNode[];
  gaps: string[];
  diagnostics: DiagnosticReport;
}

// ─── helpers ──────────────────────────────────────────────────

const CLAUDE_DIR = path.join(os.homedir(), '.claude');

function readJsonSafe(filePath: string): Record<string, unknown> {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return {}; }
}

function readFileSafe(filePath: string): string {
  try { return fs.readFileSync(filePath, 'utf-8'); }
  catch { return ''; }
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    if (key) result[key] = val;
  }
  return result;
}

// Claude Code のパスエンコーディング:
//   Mac/Linux: /Volumes/SSD2TB/foo → -Volumes-SSD2TB-foo (/ → -)
//   Windows:   C:\Users\foo.bar\gsd → c--Users-foo-bar-gsd (/\:. → - + 小文字化)
function cwdToEncoded(cwd: string): string {
  if (/^[A-Za-z]:[/\\]/.test(cwd)) {
    // Windows: コロン・バックスラッシュ・スラッシュ・ドットを全てハイフンに、小文字化
    return cwd.replace(/[/\\:.]/g, '-').toLowerCase();
  }
  // Mac/Linux: スラッシュをハイフンに（先頭スラッシュ → 先頭ハイフン）
  return cwd.replace(/\//g, '-');
}

function decodeProjectPath(encoded: string): string {
  // Windows encoded: c--Users-foo-bar-gsd
  if (/^[a-z]--/.test(encoded)) {
    return encoded[0].toUpperCase() + ':\\' + encoded.slice(3).replace(/-/g, '\\');
  }
  // 旧形式 Windows: c:-Users-foo-...（後方互換）
  if (/^[A-Za-z]:-/.test(encoded)) {
    return encoded[0].toUpperCase() + ':\\' + encoded.slice(3).replace(/-/g, '\\');
  }
  // Mac/Linux: -Volumes-SSD2TB-... → /Volumes/SSD2TB/...
  return '/' + encoded.replace(/^-/, '').replace(/-/g, '/');
}

// ─── settings ─────────────────────────────────────────────────

function parseSettings(raw: Record<string, unknown>): SettingsSnapshot {
  // mcp.json を優先して読む（settings.json の mcpServers は空のことが多い）
  const mcpJson = readJsonSafe(path.join(CLAUDE_DIR, 'mcp.json'));
  const mcpRawBase = (raw.mcpServers ?? {}) as Record<string, Record<string, unknown>>;
  const mcpRawFile = (mcpJson.mcpServers ?? {}) as Record<string, Record<string, unknown>>;
  const mcpRaw = { ...mcpRawBase, ...mcpRawFile };
  const mcpServers: McpServer[] = Object.entries(mcpRaw).map(([name, cfg]) => ({
    name,
    type: String(cfg.type ?? 'stdio'),
    command: cfg.command as string | undefined,
    url: cfg.url as string | undefined,
  }));

  // enabledPlugins をプラグイン型 MCP として追加
  const enabledPlugins = (raw.enabledPlugins ?? {}) as Record<string, boolean>;
  for (const [name, enabled] of Object.entries(enabledPlugins)) {
    if (enabled) {
      mcpServers.push({ name, type: 'plugin', command: undefined, url: undefined });
    }
  }

  const hooksRaw = (raw.hooks ?? {}) as Record<string, unknown[]>;
  const hooks: HookEntry[] = Object.entries(hooksRaw).map(([event, entries]) => ({
    event,
    matchers: (entries as Array<Record<string, unknown>>).map(
      (e) => String(e.command ?? e.matcher ?? JSON.stringify(e))
    ),
  }));

  const permRaw = (raw.permissions ?? {}) as Record<string, unknown>;
  const permissions: PermissionsInfo = {
    allowedTools: (permRaw.allow as string[] | undefined) ?? [],
    deniedTools: (permRaw.deny as string[] | undefined) ?? [],
    bypassPermissions: Boolean(raw.bypassPermissions ?? false),
    hasCustomPermissions: !!raw.permissions,
  };

  return {
    model: String(raw.model ?? '(not set)'),
    tui: String(raw.tui ?? '(not set)'),
    mcpServers,
    hooks,
    permissions,
    rawKeys: Object.keys(raw),
  };
}

// ─── CLAUDE.md ────────────────────────────────────────────────

function analyzeClaudeMd(content: string): ClaudeMdStructure {
  const lines = content.split('\n');
  const sections = lines.filter((l) => /^##\s/.test(l));
  const importantCount = (content.match(/<important/gi) ?? []).length;
  return {
    sectionCount: sections.length,
    importantCount,
    topSections: sections.slice(0, 5).map((s) => s.replace(/^##\s*/, '').trim()),
  };
}

function collectClaudeMds(cwd: string): ClaudeMdInfo[] {
  const mds: ClaudeMdInfo[] = [];

  const userMd = path.join(CLAUDE_DIR, 'CLAUDE.md');
  if (fs.existsSync(userMd)) {
    const content = readFileSafe(userMd);
    mds.push({
      path: userMd, source: 'user',
      lineCount: content.split('\n').length,
      sizeKb: Math.round(Buffer.byteLength(content, 'utf-8') / 102.4) / 10,
      structure: analyzeClaudeMd(content),
    });
  }

  let dir = cwd;
  for (let depth = 0; depth < 8; depth++) {
    const mdPath = path.join(dir, 'CLAUDE.md');
    if (fs.existsSync(mdPath)) {
      const content = readFileSafe(mdPath);
      mds.push({
        path: mdPath,
        source: dir === cwd ? 'project' : 'parent',
        lineCount: content.split('\n').length,
        sizeKb: Math.round(Buffer.byteLength(content, 'utf-8') / 102.4) / 10,
        structure: analyzeClaudeMd(content),
      });
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return mds;
}

// ─── skills ───────────────────────────────────────────────────

function collectSkills(cwd: string): SkillInfo[] {
  const skills: SkillInfo[] = [];
  const dirs: Array<{ dir: string; source: 'user' | 'project' }> = [
    { dir: path.join(CLAUDE_DIR, 'skills'), source: 'user' },
    { dir: path.join(CLAUDE_DIR, 'commands'), source: 'user' },
    { dir: path.join(cwd, '.claude', 'skills'), source: 'project' },
    { dir: path.join(cwd, '.claude', 'commands'), source: 'project' },
  ];
  for (const { dir, source } of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const content = readFileSafe(path.join(dir, file));
      const firstLine = content.split('\n').find((l) => l.trim()) ?? '';
      const fm = parseFrontmatter(content);
      const description = fm.description ?? null;
      skills.push({ name: file.replace('.md', ''), source, firstLine: firstLine.slice(0, 80), description });
    }
  }
  return skills;
}

// ─── memory ───────────────────────────────────────────────────

function collectMemory(cwd: string): MemoryInfo {
  const encoded = cwdToEncoded(cwd);
  const memoryDir = path.join(CLAUDE_DIR, 'projects', encoded, 'memory');

  const empty: MemoryTypeBreakdown = { user: 0, feedback: 0, project: 0, reference: 0, unknown: 0 };

  if (!fs.existsSync(memoryDir)) {
    return { dir: memoryDir, exists: false, fileCount: 0, indexExists: false, indexEntries: [], typeBreakdown: empty };
  }

  // サブディレクトリも含めて再帰的にファイルを収集
  function collectMdFiles(dir: string): string[] {
    const results: string[] = [];
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...collectMdFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'MEMORY.md' && entry.name !== 'README.md') {
          results.push(fullPath);
        }
      }
    } catch { /* skip unreadable dirs */ }
    return results;
  }

  const files = collectMdFiles(memoryDir);
  const typeBreakdown = { ...empty };

  for (const filePath of files) {
    const content = readFileSafe(filePath);
    const fm = parseFrontmatter(content);
    const t = fm.type as keyof MemoryTypeBreakdown | undefined;
    if (t && t in typeBreakdown) {
      typeBreakdown[t]++;
    } else {
      typeBreakdown.unknown++;
    }
  }

  const indexPath = path.join(memoryDir, 'MEMORY.md');
  const indexExists = fs.existsSync(indexPath);
  let indexEntries: string[] = [];
  if (indexExists) {
    indexEntries = readFileSafe(indexPath)
      .split('\n')
      .filter((l) => l.startsWith('- '))
      .map((l) => l.replace(/^- /, '').slice(0, 80));
  }

  return {
    dir: memoryDir,
    exists: true,
    fileCount: files.length,
    indexExists,
    indexEntries,
    typeBreakdown,
  };
}

// ─── projects list ────────────────────────────────────────────

function collectProjects(cwd: string): ProjectEntry[] {
  const projectsDir = path.join(CLAUDE_DIR, 'projects');
  if (!fs.existsSync(projectsDir)) return [];

  const currentEncoded = cwdToEncoded(cwd);

  return fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e): ProjectEntry => {
      const memDir = path.join(projectsDir, e.name, 'memory');
      const hasMemory = fs.existsSync(memDir);
      const memoryFileCount = hasMemory
        ? fs.readdirSync(memDir).filter((f) => f.endsWith('.md')).length
        : 0;
      return {
        encodedName: e.name,
        decodedPath: decodeProjectPath(e.name),
        hasMemory,
        memoryFileCount,
        isCurrent: e.name === currentEncoded,
      };
    })
    .sort((a, b) => b.memoryFileCount - a.memoryFileCount);
}

// ─── folder tree ──────────────────────────────────────────────

const KNOWN_DIR_NOTES: Record<string, string> = {
  'commands': 'skills',
  'memory': '記憶ファイル',
  'projects': '各プロジェクト記憶',
  'settings.json': 'model / MCP / hooks',
  'CLAUDE.md': 'ユーザーレベル指示',
  'MEMORY.md': 'memory インデックス',
};

function buildFolderTree(dirPath: string, maxDepth: number, depth = 0): FolderNode[] {
  if (!fs.existsSync(dirPath)) return [];
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); }
  catch { return []; }

  const skip = /^(node_modules|\.git|dist)$/;
  return entries
    .filter((e) => !skip.test(e.name))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map((e): FolderNode => {
      const note = KNOWN_DIR_NOTES[e.name];
      if (e.isDirectory()) {
        const children = depth < maxDepth
          ? buildFolderTree(path.join(dirPath, e.name), maxDepth, depth + 1)
          : [{ name: '...', type: 'file' as const }];
        return { name: e.name, type: 'dir', children, note };
      }
      return { name: e.name, type: 'file', note };
    });
}

function collectFolderTree(cwd: string): FolderNode[] {
  const nodes: FolderNode[] = [];

  if (fs.existsSync(CLAUDE_DIR)) {
    const children = buildFolderTree(CLAUDE_DIR, 2).map((node) => {
      if (node.name === 'projects' && node.type === 'dir') {
        const count = fs.existsSync(path.join(CLAUDE_DIR, 'projects'))
          ? fs.readdirSync(path.join(CLAUDE_DIR, 'projects')).length : 0;
        return { ...node, children: [{ name: `(${count}プロジェクト)`, type: 'file' as const }] };
      }
      return node;
    });
    nodes.push({ name: '~/.claude/', type: 'dir', children });
  }

  const projectClaudeDir = path.join(cwd, '.claude');
  if (fs.existsSync(projectClaudeDir)) {
    nodes.push({ name: '.claude/ (プロジェクト)', type: 'dir', children: buildFolderTree(projectClaudeDir, 2) });
  }

  return nodes;
}

export function renderTree(nodes: FolderNode[], prefix = ''): string[] {
  const lines: string[] = [];
  nodes.forEach((node, i) => {
    const last = i === nodes.length - 1;
    const icon = node.type === 'dir' ? '📁 ' : '📄 ';
    const note = node.note ? `  ← ${node.note}` : '';
    lines.push(`${prefix}${last ? '└── ' : '├── '}${icon}${node.name}${note}`);
    if (node.children?.length) {
      lines.push(...renderTree(node.children, prefix + (last ? '    ' : '│   ')));
    }
  });
  return lines;
}

// ─── gaps ─────────────────────────────────────────────────────

function detectGaps(snapshot: Omit<ConfigSnapshot, 'gaps' | 'diagnostics'>): string[] {
  const gaps: string[] = [];

  if (snapshot.settings.model === '(not set)')
    gaps.push('model が未設定');
  if (snapshot.settings.mcpServers.length === 0)
    gaps.push('MCP サーバーが未設定 — ツール拡張ができない状態');
  if (snapshot.settings.hooks.length === 0)
    gaps.push('Hooks が未設定 — 自動化トリガーが使えない状態');
  if (!snapshot.claudeMds.find((m) => m.source === 'user'))
    gaps.push('ユーザーレベル CLAUDE.md がない — 全プロジェクト共通の指示が設定できていない');
  if (!snapshot.claudeMds.find((m) => m.source === 'project') &&
      !snapshot.claudeMds.find((m) => m.source === 'user'))
    gaps.push('CLAUDE.md がない — ユーザーレベルまたはプロジェクトレベルに設定してください');
  if (snapshot.skills.length === 0)
    gaps.push('Skills がない — カスタム /コマンド が使えない状態');
  if (!snapshot.memory.exists)
    gaps.push('Memory が未初期化 — 会話横断の記憶が使えない状態');
  else if (snapshot.memory.fileCount < 3)
    gaps.push(`Memory ファイルが少ない (${snapshot.memory.fileCount}件)`);
  if (snapshot.memory.exists && snapshot.memory.typeBreakdown.feedback === 0)
    gaps.push('feedback memory がない — 過去の指摘が次のセッションに引き継がれていない');

  return gaps;
}

// ─── diagnostics ──────────────────────────────────────────────

function runDiagnostics(snapshot: Omit<ConfigSnapshot, 'gaps' | 'diagnostics'>): DiagnosticReport {
  const items: DiagnosticItem[] = [];

  // context カテゴリ
  const totalLines = snapshot.claudeMds.reduce((sum, m) => sum + m.lineCount, 0);
  if (totalLines > 500) {
    items.push({
      severity: 'error',
      category: 'context',
      title: 'Context が重大に肥大化しています',
      detail: `CLAUDE.md の合計行数: ${totalLines}行（上限目安: 500行）`,
      suggestion: 'セクションを分割し、都度呼び出しの参照ファイルに移してください',
    });
  } else if (totalLines > 300) {
    items.push({
      severity: 'warn',
      category: 'context',
      title: 'Context がやや大きくなっています',
      detail: `CLAUDE.md の合計行数: ${totalLines}行（推奨: 300行以内）`,
      suggestion: '不要なセクションを別ファイルに移す、または削除を検討してください',
    });
  }

  const totalImportant = snapshot.claudeMds.reduce((sum, m) => sum + m.structure.importantCount, 0);
  if (totalImportant >= 5) {
    items.push({
      severity: 'warn',
      category: 'context',
      title: '<important> の多用は Context 負荷になります',
      detail: `<important> タグが合計 ${totalImportant} 個あります`,
      suggestion: '本当に重要な箇所だけに絞り込んでください',
    });
  }

  // mcp カテゴリ
  const stdioMcps = snapshot.settings.mcpServers.filter((s) => s.type === 'stdio');
  const npxMcps = stdioMcps.filter((s) => s.command === 'npx');
  if (npxMcps.length >= 3) {
    items.push({
      severity: 'warn',
      category: 'mcp',
      title: 'npx 系 MCP が多い',
      detail: `npx で起動する MCP が ${npxMcps.length} 個あります`,
      suggestion: 'グローバルインストール済みのコマンドに切り替えると起動コストを削減できます',
    });
  }
  if (stdioMcps.length >= 5) {
    items.push({
      severity: 'warn',
      category: 'mcp',
      title: 'stdio プロセスが多い',
      detail: `stdio 型 MCP が ${stdioMcps.length} 個あります`,
      suggestion: '使用頻度の低い MCP は無効化を検討してください',
    });
  }

  // hooks カテゴリ
  const preToolUseHooks = snapshot.settings.hooks.filter((h) => h.event === 'PreToolUse');
  if (preToolUseHooks.length >= 3) {
    items.push({
      severity: 'warn',
      category: 'hooks',
      title: 'PreToolUse Hook が多い',
      detail: `PreToolUse Hook が ${preToolUseHooks.length} 個あります`,
      suggestion: 'ツール実行前の待機時間が蓄積します。統合できるものはまとめてください',
    });
  }
  const userPromptHooks = snapshot.settings.hooks.filter((h) => h.event === 'UserPromptSubmit');
  if (userPromptHooks.length > 0) {
    items.push({
      severity: 'info',
      category: 'hooks',
      title: 'UserPromptSubmit Hook が設定されています',
      detail: `すべての送信前に ${userPromptHooks.length} 個の Hook が実行されます`,
    });
  }

  // memory カテゴリ
  if (snapshot.memory.exists && snapshot.memory.dir) {
    try {
      const memFiles = fs.readdirSync(snapshot.memory.dir)
        .filter((f) => f.endsWith('.md') && f !== 'MEMORY.md' && f !== 'README.md');
      if (memFiles.length > 0) {
        let oldestMtime = Date.now();
        for (const file of memFiles) {
          try {
            const stat = fs.statSync(path.join(snapshot.memory.dir!, file));
            if (stat.mtimeMs < oldestMtime) oldestMtime = stat.mtimeMs;
          } catch { /* skip */ }
        }
        const daysSince = Math.floor((Date.now() - oldestMtime) / (1000 * 60 * 60 * 24));
        if (daysSince >= 90) {
          items.push({
            severity: 'warn',
            category: 'memory',
            title: 'Memory が長期間更新されていない可能性があります',
            detail: `最も古い更新から ${daysSince} 日経過しています`,
            suggestion: '不要になった Memory を整理し、新しい情報を追記してください',
          });
        }
      }
    } catch { /* directory read failed, skip */ }

    if (snapshot.memory.typeBreakdown.feedback === 0 && snapshot.memory.fileCount >= 10) {
      items.push({
        severity: 'warn',
        category: 'memory',
        title: 'feedback type の Memory がありません',
        detail: `Memory は ${snapshot.memory.fileCount} 件ありますが feedback 型が 0 件です`,
        suggestion: '過去の指摘・修正を feedback type の Memory として記録してください',
      });
    }
  }

  // skills カテゴリ
  if (snapshot.skills.length >= 10) {
    items.push({
      severity: 'info',
      category: 'skills',
      title: '多くの Skills が登録されています',
      detail: `Skills が ${snapshot.skills.length} 個あります`,
      suggestion: '使っていないものは整理を検討してください',
    });
  }

  const score = Math.max(
    0,
    100
      - items.filter((i) => i.severity === 'error').length * 20
      - items.filter((i) => i.severity === 'warn').length * 8
      - items.filter((i) => i.severity === 'info').length * 2
  );

  return { items, score };
}

// ─── main export ──────────────────────────────────────────────

export function inspect(cwd?: string): ConfigSnapshot {
  const resolvedCwd = cwd ?? process.cwd();

  // MCP はユーザー設定 + プロジェクト設定 + local 設定をマージ
  const rawUser = readJsonSafe(path.join(CLAUDE_DIR, 'settings.json'));
  const rawProject = readJsonSafe(path.join(resolvedCwd, '.claude', 'settings.json'));
  const rawLocal = readJsonSafe(path.join(resolvedCwd, '.claude', 'settings.local.json'));
  const mergedMcp = {
    ...(rawUser.mcpServers as Record<string, unknown> ?? {}),
    ...(rawProject.mcpServers as Record<string, unknown> ?? {}),
    ...(rawLocal.mcpServers as Record<string, unknown> ?? {}),
  };
  const raw = { ...rawUser, ...rawProject, ...rawLocal, mcpServers: mergedMcp };
  const settings = parseSettings(raw);
  const claudeMds = collectClaudeMds(resolvedCwd);
  const skills = collectSkills(resolvedCwd);
  const memory = collectMemory(resolvedCwd);
  const projects = collectProjects(resolvedCwd);
  const folderTree = collectFolderTree(resolvedCwd);
  const partial = { cwd: resolvedCwd, settings, claudeMds, skills, memory, projects, folderTree };
  const gaps = detectGaps(partial);
  const diagnostics = runDiagnostics(partial);
  return { ...partial, gaps, diagnostics };
}

export function formatSnapshot(snapshot: ConfigSnapshot): string {
  const lines: string[] = ['# Claude Code Config Snapshot', `\`${snapshot.cwd}\``, ''];

  lines.push('## Settings');
  lines.push(`- Model: ${snapshot.settings.model}`);
  lines.push(`- TUI: ${snapshot.settings.tui}`);
  if (snapshot.settings.permissions.hasCustomPermissions) {
    lines.push(`- 許可ツール: ${snapshot.settings.permissions.allowedTools.join(', ') || 'なし'}`);
    lines.push(`- 拒否ツール: ${snapshot.settings.permissions.deniedTools.join(', ') || 'なし'}`);
  }
  lines.push('');

  lines.push('## MCP Servers');
  if (!snapshot.settings.mcpServers.length) lines.push('_なし_');
  else snapshot.settings.mcpServers.forEach((s) => lines.push(`- **${s.name}** (${s.type}) — ${s.command ?? s.url ?? ''}`));
  lines.push('');

  lines.push('## CLAUDE.md');
  snapshot.claudeMds.forEach((m) =>
    lines.push(`- [${m.source}] ${m.path} (${m.lineCount}行 / ${m.structure.sectionCount}セクション / <important> ${m.structure.importantCount}個)`)
  );
  if (!snapshot.claudeMds.length) lines.push('_なし_');
  lines.push('');

  lines.push(`## Memory (${snapshot.memory.fileCount}件)`);
  if (snapshot.memory.exists) {
    const { typeBreakdown: t } = snapshot.memory;
    lines.push(`- user:${t.user} / feedback:${t.feedback} / project:${t.project} / reference:${t.reference} / unknown:${t.unknown}`);
  } else {
    lines.push('_未初期化_');
  }
  lines.push('');

  lines.push(`## Projects (${snapshot.projects.length}件)`);
  snapshot.projects.slice(0, 5).forEach((p) =>
    lines.push(`- ${p.isCurrent ? '★ ' : ''}${p.decodedPath} (memory: ${p.memoryFileCount}件)`)
  );
  lines.push('');

  lines.push('## 改善できる箇所');
  if (!snapshot.gaps.length) lines.push('✅ 設定は充実しています');
  else snapshot.gaps.forEach((g) => lines.push(`- ⚠️ ${g}`));
  lines.push('');

  const { diagnostics } = snapshot;
  lines.push(`## Diagnostics (${diagnostics.items.length}件) — Score: ${diagnostics.score}`);
  if (!diagnostics.items.length) {
    lines.push('✅ 診断上の問題はありません');
  } else {
    for (const item of diagnostics.items) {
      const icon = item.severity === 'error' ? '🔴' : item.severity === 'warn' ? '🟡' : '🔵';
      lines.push(`${icon} [${item.category}] ${item.title}`);
      lines.push(`  ${item.detail}`);
      if (item.suggestion) lines.push(`  → ${item.suggestion}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}
