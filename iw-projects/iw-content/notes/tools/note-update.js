/**
 * note-update.js — 公開済み note 記事の本文 + カバー画像を差し替えて更新する
 *
 * Usage: node note-update.js <edit-url> <image-path> <markdown-file>
 *   edit-url:      https://editor.note.com/notes/<id>/edit/
 *   image-path:    差し替え後のカバー画像（1280×670 合成済み PNG）
 *   markdown-file: for-note.md（`---` 以降が本文として使われる）
 *
 * 手順: 本文全選択→ペースト → カバー✕削除（座標特定）→ 新カバー追加 → 公開に進む → 更新する
 * 初出: 2026-07-03 note第15回のサムネ+本文差し替え（ベッキー単独名義改稿）
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROFILE_DIR = path.join(process.env.HOME, '.stackchan', 'note-chrome-profile');
const [, , EDIT_URL, IMAGE_PATH, MD_PATH] = process.argv;

function parseBody(filePath) {
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  const start = lines.findIndex(l => l.trim() === '---') + 1;
  return lines.slice(start).join('\n').trim();
}

(async () => {
  const body = parseBody(MD_PATH);
  console.log(`📄 新本文: ${body.length} 文字`);

  try { execSync(`pkill -f "note-chrome-profile"`, { stdio: 'ignore' }); } catch (_) {}
  await new Promise(r => setTimeout(r, 800));

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = await context.newPage();
  await page.goto(EDIT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  console.log('現在URL:', page.url());

  // Step 1: 本文を全選択 → 新本文ペースト（タイトルは textarea 別枠なので触らない）
  console.log('✍️  本文差し替え中...');
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
  await page.waitForTimeout(1500);
  console.log('✅ 本文差し替え完了');

  // Step 2: ページ先頭に戻ってから既存カバー画像の✕ボタンで削除
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);
  await page.mouse.move(640, 260); // カバー画像上にホバーして✕を出す
  await page.waitForTimeout(800);
  // ページ上部（カバー画像領域 y<450）に実際に見えているボタンを座標で特定
  const xy = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.top > 80 && r.top < 450 && r.left > 850 &&
          /削除|解除|✕|close/i.test((b.getAttribute('aria-label') || '') + b.className)) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    // aria-label で見つからなければカバー領域右上のボタンを位置だけで拾う
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.width < 60 && r.top > 90 && r.top < 200 && r.left > 850 && r.left < 960) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  });
  console.log('✕ボタン座標:', xy);
  await page.mouse.click(xy ? xy.x : 906, xy ? xy.y : 133);
  await page.waitForTimeout(1500);
  console.log('🗑 既存カバー削除');

  // Step 3: 「画像を追加」→「画像をアップロード」→ filechooser
  await page.mouse.move(640, 150);
  await page.waitForTimeout(600);
  const coverBtns = await page.$$('button[aria-label="画像を追加"]');
  if (coverBtns.length > 0) {
    await coverBtns[0].click();
  } else {
    await page.mouse.click(640, 120);
  }
  await page.waitForTimeout(800);

  const [fc] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 8000 }),
    page.locator('text="画像をアップロード"').first().click(),
  ]);
  await fc.setFiles(IMAGE_PATH);
  await page.waitForTimeout(3000);

  const saveImageBtn = page.locator('button').filter({ hasText: /^保存$/ });
  if (await saveImageBtn.count() > 0) {
    await saveImageBtn.first().click();
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: '/tmp/swap-4-uploaded.png' });
  console.log('✅ 新カバーアップロード完了');

  // Step 4: 「公開に進む」→「投稿する」で更新確定
  await page.locator('button').filter({ hasText: /^公開に進む$/ }).first().click();
  await page.waitForTimeout(3000);

  const postBtn = page.locator('button').filter({ hasText: /^(投稿する|更新する)$/ });
  await postBtn.first().waitFor({ timeout: 8000 });
  await postBtn.first().click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: '/tmp/swap-6-done.png' });
  console.log('✅ 更新確定 最終URL:', page.url());

  await context.close();
  console.log('完了');
})().catch(async (e) => { console.error('❌', e.message); process.exit(1); });
