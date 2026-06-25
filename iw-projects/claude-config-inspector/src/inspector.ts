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

export interface ConfigSnapshot {
  cwd: string;
  settings: SettingsSnapshot;
  claudeMds: ClaudeMdInfo[];
  skills: SkillInfo[];
  memory: MemoryInfo;
  projects: ProjectEntry[];
  folderTree: FolderNode[];
  gaps: string[];
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

function decodeProjectPath(encoded: string): string {
  // Windows: C:-Users-foo-... → C:\Users\foo\...
  if (/^[A-Za-z]:-/.test(encoded)) {
    return encoded[0] + ':\\' + encoded.slice(3).replace(/-/g, '\\');
  }
  // Mac/Linux: -Volumes-SSD2TB-... → /Volumes/SSD2TB/...
  return '/' + encoded.replace(/^-/, '').replace(/-/g, '/');
}

// ─── settings ─────────────────────────────────────────────────

function parseSettings(raw: Record<string, unknown>): SettingsSnapshot {
  const mcpRaw = (raw.mcpServers ?? {}) as Record<string, Record<string, unknown>>;
  const mcpServers: McpServer[] = Object.entries(mcpRaw).map(([name, cfg]) => ({
    name,
    type: String(cfg.type ?? 'stdio'),
    command: cfg.command as string | undefined,
    url: cfg.url as string | undefined,
  }));

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
      skills.push({ name: file.replace('.md', ''), source, firstLine: firstLine.slice(0, 80) });
    }
  }
  return skills;
}

// ─── memory ───────────────────────────────────────────────────

function collectMemory(cwd: string): MemoryInfo {
  // Mac: /Volumes/... → -Volumes-... (leading dash must be kept)
  // Windows: C:\Users\... → C:-Users-... (no leading dash)
  const encoded = cwd.replace(/[/\\]/g, '-');
  const memoryDir = path.join(CLAUDE_DIR, 'projects', encoded, 'memory');

  const empty: MemoryTypeBreakdown = { user: 0, feedback: 0, project: 0, reference: 0, unknown: 0 };

  if (!fs.existsSync(memoryDir)) {
    return { dir: memoryDir, exists: false, fileCount: 0, indexExists: false, indexEntries: [], typeBreakdown: empty };
  }

  const files = fs.readdirSync(memoryDir).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md');
  const typeBreakdown = { ...empty };

  for (const file of files) {
    const content = readFileSafe(path.join(memoryDir, file));
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

  const currentEncoded = cwd.replace(/[/\\]/g, '-');

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

function detectGaps(snapshot: Omit<ConfigSnapshot, 'gaps'>): string[] {
  const gaps: string[] = [];

  if (snapshot.settings.model === '(not set)')
    gaps.push('model が未設定');
  if (snapshot.settings.mcpServers.length === 0)
    gaps.push('MCP サーバーが未設定 — ツール拡張ができない状態');
  if (snapshot.settings.hooks.length === 0)
    gaps.push('Hooks が未設定 — 自動化トリガーが使えない状態');
  if (!snapshot.claudeMds.find((m) => m.source === 'user'))
    gaps.push('ユーザーレベル CLAUDE.md がない — 全プロジェクト共通の指示が設定できていない');
  if (!snapshot.claudeMds.find((m) => m.source === 'project'))
    gaps.push('プロジェクト CLAUDE.md がない');
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
  return { ...partial, gaps: detectGaps(partial) };
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

  return lines.join('\n');
}
