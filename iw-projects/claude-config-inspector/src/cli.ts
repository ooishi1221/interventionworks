#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { inspect, formatSnapshot } from './inspector.js';
import { generateHtml } from './html-reporter.js';

const args = process.argv.slice(2);
const htmlMode = args.includes('--html');
const analyzeMode = args.includes('--analyze');
const cwdArg = args.find((a) => !a.startsWith('--'));
const cwd = cwdArg ?? process.cwd();

const snapshot = inspect(cwd);

function openBrowser(filePath: string): void {
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      execSync(`start "" "${filePath}"`);
    } else if (platform === 'darwin') {
      execSync(`open "${filePath}"`);
    } else {
      execSync(`xdg-open "${filePath}"`);
    }
  } catch {
    console.log(`ブラウザで開けませんでした。手動で開いてください: ${filePath}`);
  }
}

function writeHtmlReport(): string {
  const html = generateHtml(snapshot);
  const outPath = path.join(cwd, 'claude-config-report.html');
  fs.writeFileSync(outPath, html, 'utf-8');
  console.log(`レポートを生成しました: ${outPath}`);
  return outPath;
}

function buildSystemPrompt(): string {
  // skills/memory はサマリーだけにする（文字数制限対策）
  const summary = {
    cwd: snapshot.cwd,
    model: snapshot.settings.model,
    mcpServers: snapshot.settings.mcpServers.map((s) => ({ name: s.name, type: s.type })),
    hookCount: snapshot.settings.hooks.length,
    permissions: {
      bypassPermissions: snapshot.settings.permissions.bypassPermissions,
      allowedToolsCount: snapshot.settings.permissions.allowedTools.length,
      deniedToolsCount: snapshot.settings.permissions.deniedTools.length,
    },
    claudeMds: snapshot.claudeMds.map((m) => ({
      source: m.source,
      path: m.path,
      lineCount: m.lineCount,
      sectionCount: m.structure.sectionCount,
      importantCount: m.structure.importantCount,
      topSections: m.structure.topSections,
    })),
    skills: snapshot.skills.map((s) => ({
      name: s.name,
      source: s.source,
      description: s.description ?? s.firstLine.slice(0, 60),
    })),
    memory: {
      exists: snapshot.memory.exists,
      fileCount: snapshot.memory.fileCount,
      indexExists: snapshot.memory.indexExists,
      typeBreakdown: snapshot.memory.typeBreakdown,
    },
    diagnostics: {
      score: snapshot.diagnostics.score,
      items: snapshot.diagnostics.items.map((i) => ({
        severity: i.severity,
        category: i.category,
        title: i.title,
      })),
    },
    gaps: snapshot.gaps,
  };

  const json = JSON.stringify(summary, null, 2);
  return `あなたは Claude Code 構成アドバイザーです。
以下は対象ユーザーの Claude Code 構成スナップショットです。

${json}

この構成から:
1. このユーザーがどんな使い方をしているか分析してください
2. 改善できる点を提案してください
3. 構成をより良くするためのヒアリングをしてください

まずは「こんにちは！構成を拝見しました。」という感じで話しかけてください。`;
}

if (analyzeMode) {
  // 1. HTML レポートを生成してブラウザで開く
  const outPath = writeHtmlReport();
  openBrowser(outPath);

  // 2. claude をインタラクティブに起動してシステムプロンプトを渡す
  const systemPrompt = buildSystemPrompt();

  console.log('\nClaude を起動して構成分析を開始します...\n');

  const env = { ...process.env };
  // Claude Code サンドボックスの環境変数を除去してインタラクティブモードで起動
  ['CLAUDECODE', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SSE_PORT',
   'AI_AGENT', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'].forEach(k => delete env[k]);

  const child = spawn('claude', ['--append-system-prompt', systemPrompt], {
    stdio: 'inherit',
    shell: false,
    cwd,
    env,
  });

  child.on('error', (err) => {
    console.error('claude コマンドの起動に失敗しました:', err.message);
    console.error('`claude` が PATH に存在するか確認してください。');
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
} else if (htmlMode) {
  const outPath = writeHtmlReport();
  openBrowser(outPath);
} else {
  console.log(formatSnapshot(snapshot));
}
