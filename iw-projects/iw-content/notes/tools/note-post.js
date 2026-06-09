#!/usr/bin/env node
/**
 * note-post.js — Playwright で note.com に記事を下書き保存 + サムネイル自動生成
 *
 * Usage:
 *   node note-post.js <markdown-file-path>
 *
 * 初回: ブラウザが開いてログイン画面が出る → 手動でログイン → Enter
 * 2回目以降: 永続セッション (note-chrome-profile) で自動
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { makeThumbnail } = require('./make-thumbnail');

const PROFILE_DIR = path.join(process.env.HOME, '.stackchan', 'note-chrome-profile');
const SESSION_MARKER = path.join(PROFILE_DIR, '.logged_in');

function parseArticle(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');
  let title = '', tags = [], bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('タイトル:')) title = line.replace('タイトル:', '').trim();
    else if (line.startsWith('タグ')) {
      tags = (line.replace(/^タグ[（(].*?[)）]?\s*[:：]/, '').trim()).match(/#[\w぀-ヿ一-鿿･-ﾟ]+/g) || [];
    } else if (line === '---') { bodyStart = i + 1; break; }
  }
  return { title, tags, body: lines.slice(bodyStart).join('\n').trim() };
}

async function waitForEnter(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(msg, () => { rl.close(); r(); }));
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('Usage: node note-post.js <markdown-file>'); process.exit(1); }

  const { title, tags, body } = parseArticle(filePath);
  console.log(`📝 タイトル: ${title}`);
  console.log(`🏷  タグ: ${tags.join(' ')}`);
  console.log(`📄 本文: ${body.length} 文字`);

  // サムネイル生成
  console.log('🎨 サムネイル生成中...');
  const thumbPath = `/tmp/becky_thumb_${Date.now()}.png`;
  await makeThumbnail(title, thumbPath);

  const isFirstRun = !fs.existsSync(SESSION_MARKER);

  // 永続コンテキスト（Chrome 使用でボット検知回避）
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  }).catch(() =>
    // chrome がない場合は Playwright の Chromium にフォールバック
    chromium.launchPersistentContext(PROFILE_DIR, { headless: false })
  );

  const page = await context.newPage();

  if (isFirstRun) {
    await page.goto('https://note.com/login');
    console.log('\n⚠️  ブラウザが開きました。note.com にログインしてください。');
    await waitForEnter('ログイン完了したら Enter を押してください: ');
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
    fs.writeFileSync(SESSION_MARKER, new Date().toISOString());
    console.log('✅ ログイン状態を保存しました');
  }

  // note.com トップ → 投稿 → テキスト で新規エディタを開く
  console.log('\n🚀 note エディタを起動中...');
  await page.goto('https://note.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // ログイン確認
  if (page.url().includes('login')) {
    fs.unlinkSync(SESSION_MARKER);
    console.log('⚠️  セッション切れ。再実行してください。');
    await context.close(); process.exit(1);
  }

  // 「投稿」ボタン → 「テキスト」
  try {
    await page.locator('button:has-text("投稿"), a:has-text("投稿")').first().click();
    await page.waitForTimeout(800);
    await page.locator('text="テキスト"').click();
    await page.waitForURL('**/notes/new', { timeout: 10000 });
  } catch (_) {
    // フォールバック: 直接 URL へ
    await page.goto('https://note.com/notes/new', { waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(2000);

  // タイトル入力
  console.log('✍️  タイトル入力中...');
  const titleEl = await page.waitForSelector(
    'textarea[placeholder="記事タイトル"], [placeholder="記事タイトル"]',
    { timeout: 10000 }
  );
  await titleEl.fill(title);
  await page.waitForTimeout(500);

  // カバー画像アップロード（タイトル上の「画像を追加」ボタン）
  console.log('🖼  カバー画像をセット中...');
  let coverDone = false;
  try {
    // タイトルの上にあるカバー画像ボタン（aria-label="画像を追加" の最初の1個）
    // ホバーで出現する場合に備えてマウスを上部に移動
    await page.mouse.move(640, 150);
    await page.waitForTimeout(600);
    await page.mouse.move(640, 100);
    await page.waitForTimeout(600);

    // Step 1: カバー画像ボタンをクリックしてメニューを開く
    const coverBtns = await page.$$('button[aria-label="画像を追加"]');
    if (coverBtns.length > 0) {
      await coverBtns[0].click();
    } else {
      await page.mouse.click(640, 120);
    }
    await page.waitForTimeout(600);

    // Step 2: メニュー内の「画像をアップロード」をクリック → filechooser
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5000 }),
      page.locator('text="画像をアップロード"').first().click(),
    ]).catch(() => [null]);

    if (fc) {
      await fc.setFiles(thumbPath);
      await page.waitForTimeout(3000);
      // 画像プレビューダイアログの「保存」ボタンをクリック（完全一致）
      const saveImageBtn = page.locator('button').filter({ hasText: /^保存$/ });
      if (await saveImageBtn.count() > 0) {
        await saveImageBtn.first().click();
        await page.waitForTimeout(1500);
      }
      console.log('✅ カバー画像アップロード完了');
      coverDone = true;
    }
  } catch (_) {}
  if (!coverDone) console.log('⚠️  カバー画像: 自動設定できず（手動で追加してください）');

  // 本文入力
  console.log('✍️  本文入力中...');
  const bodyEl = await page.waitForSelector('.ProseMirror', { timeout: 10000 });
  await bodyEl.click();
  await page.evaluate(t => navigator.clipboard.writeText(t), body);
  await page.keyboard.down('Meta');
  await page.keyboard.press('a');
  await page.keyboard.up('Meta');
  await page.keyboard.press('Backspace');
  await page.keyboard.down('Meta');
  await page.keyboard.press('v');
  await page.keyboard.up('Meta');
  await page.waitForTimeout(1000);

  // 下書き保存
  console.log('💾 下書き保存中...');
  const saveBtn = await page.$('button:has-text("下書き保存")');
  if (saveBtn) {
    await saveBtn.click();
    await page.waitForTimeout(2000);
    console.log('✅ 下書き保存完了！');
  } else {
    await page.keyboard.down('Meta'); await page.keyboard.press('s'); await page.keyboard.up('Meta');
    await page.waitForTimeout(2000);
    console.log('✅ 自動保存');
  }

  try { fs.unlinkSync(thumbPath); } catch (_) {}

  console.log(`\n🔗 URL: ${page.url()}`);
  console.log('\n完了！ブラウザを確認して Enter で閉じます。');
  await waitForEnter('');
  await context.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
