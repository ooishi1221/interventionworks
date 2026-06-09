#!/usr/bin/env node
/**
 * note-post.js — Playwright で note.com に記事を下書き保存
 *
 * Usage:
 *   node note-post.js <markdown-file-path>
 *
 * 初回: ブラウザが開いてログイン画面が出る → 手動でログイン → Enter
 * 2回目以降: session 再利用で自動
 *
 * markdown ファイル形式:
 *   [note ペースト用整形版]
 *   タイトル: ...
 *   サブタイトル / リード: ...
 *   タグ: #tag1 #tag2
 *   公開推し: YYYY-MM-DD
 *   ---
 *   本文...
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SESSION_FILE = path.join(process.env.HOME, '.stackchan', 'note_session.json');

function parseArticle(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');

  let title = '';
  let tags = [];
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('タイトル:')) {
      title = line.replace('タイトル:', '').trim();
    } else if (line.startsWith('タグ')) {
      const tagLine = line.replace(/^タグ[（(].*?[)）]?\s*[:：]/, '').trim();
      tags = tagLine.match(/#[\w぀-ヿ一-鿿･-ﾟ]+/g) || [];
    } else if (line === '---') {
      bodyStart = i + 1;
      break;
    }
  }

  const body = lines.slice(bodyStart).join('\n').trim();
  return { title, tags, body };
}

async function waitForEnter(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(message, () => { rl.close(); resolve(); });
  });
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node note-post.js <markdown-file-path>');
    process.exit(1);
  }

  const { title, tags, body } = parseArticle(filePath);
  console.log(`📝 タイトル: ${title}`);
  console.log(`🏷  タグ: ${tags.join(' ')}`);
  console.log(`📄 本文: ${body.length} 文字`);

  const hasSession = fs.existsSync(SESSION_FILE);

  const browser = await chromium.launch({ headless: false });
  const context = hasSession
    ? await chromium.launchPersistentContext(
        path.join(process.env.HOME, '.stackchan', 'note-chrome-profile'),
        { headless: false }
      )
    : await browser.newContext();

  if (!hasSession) {
    const page = await context.newPage();
    await page.goto('https://note.com/login');
    console.log('\n⚠️  ブラウザが開きました。note.com にログインしてください。');
    await waitForEnter('ログイン完了したら Enter を押してください: ');
    // session 保存
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    const cookies = await context.cookies();
    fs.writeFileSync(SESSION_FILE, JSON.stringify(cookies));
    console.log('✅ セッション保存完了');
  }

  const page = hasSession ? (await context.newPage()) : (context.pages()[0] || await context.newPage());

  if (hasSession) {
    // cookie を注入
    const cookies = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
    await context.addCookies(cookies);
  }

  console.log('\n🚀 note エディタを開いています...');
  await page.goto('https://note.com/notes/new', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // ログイン確認
  const currentUrl = page.url();
  if (currentUrl.includes('login')) {
    console.log('⚠️  セッション切れ。再ログインが必要です。');
    fs.unlinkSync(SESSION_FILE);
    console.log('SESSION_FILE を削除しました。再実行してください。');
    await browser.close();
    process.exit(1);
  }

  // タイトル入力
  console.log('✍️  タイトル入力中...');
  const titleEl = await page.waitForSelector('[placeholder="記事タイトル"], .title input, h1[contenteditable]', { timeout: 10000 });
  await titleEl.click();
  await titleEl.fill(title);
  await page.waitForTimeout(500);

  // 本文入力
  console.log('✍️  本文入力中...');
  // note の本文エリア
  const bodyEl = await page.waitForSelector(
    '.ProseMirror, [contenteditable="true"].body, .note-editor-body',
    { timeout: 10000 }
  );
  await bodyEl.click();
  // clipboard 経由でペースト（日本語対応）
  await page.evaluate((text) => {
    navigator.clipboard.writeText(text);
  }, body);
  await page.keyboard.down('Meta');
  await page.keyboard.press('a');
  await page.keyboard.up('Meta');
  await page.keyboard.press('Delete');
  await page.keyboard.down('Meta');
  await page.keyboard.press('v');
  await page.keyboard.up('Meta');
  await page.waitForTimeout(1000);

  // 下書き保存ボタン
  console.log('💾 下書き保存中...');
  const saveBtn = await page.$('button:has-text("下書き保存"), button:has-text("保存")');
  if (saveBtn) {
    await saveBtn.click();
    await page.waitForTimeout(2000);
    console.log('✅ 下書き保存完了！');
  } else {
    // キーボードショートカット試行
    await page.keyboard.down('Meta');
    await page.keyboard.press('s');
    await page.keyboard.up('Meta');
    await page.waitForTimeout(2000);
    console.log('✅ 保存ショートカット実行');
  }

  const finalUrl = page.url();
  console.log(`\n🔗 URL: ${finalUrl}`);
  console.log('\n完了！ブラウザを閉じてください。');

  await waitForEnter('確認したら Enter を押してブラウザを閉じます: ');
  await browser.close();
}

main().catch(e => {
  console.error('❌ エラー:', e.message);
  process.exit(1);
});
