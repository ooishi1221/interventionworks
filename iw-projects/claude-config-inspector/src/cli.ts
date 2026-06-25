#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { inspect, formatSnapshot } from './inspector.js';
import { generateHtml } from './html-reporter.js';

const args = process.argv.slice(2);
const htmlMode = args.includes('--html');
const cwdArg = args.find((a) => !a.startsWith('--'));
const cwd = cwdArg ?? process.cwd();

const snapshot = inspect(cwd);

if (htmlMode) {
  const html = generateHtml(snapshot);
  const outPath = path.join(os.tmpdir(), 'claude-config-report.html');
  fs.writeFileSync(outPath, html, 'utf-8');
  console.log(`レポートを生成しました: ${outPath}`);

  // OS に応じてブラウザを開く
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      execSync(`start "" "${outPath}"`);
    } else if (platform === 'darwin') {
      execSync(`open "${outPath}"`);
    } else {
      execSync(`xdg-open "${outPath}"`);
    }
  } catch {
    console.log(`ブラウザで開けませんでした。手動で開いてください: ${outPath}`);
  }
} else {
  console.log(formatSnapshot(snapshot));
}
