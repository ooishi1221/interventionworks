#!/usr/bin/env node
/**
 * note-update.js — 公開済み記事の本文を更新する
 *
 * Usage:
 *   node note-update.js <markdown-file-path> <note-url>
 *
 * 例:
 *   node note-update.js ../01-tofu-mental-ai-design-for-note.md https://note.com/intervention_jp/n/na2cdd5ead7c1
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PROFILE_DIR = path.join(process.env.HOME, '.stackchan', 'note-chrome-profile');

function parseArticle(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');
  let title = '', subtitle = '', bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('タイトル:')) title = line.replace('タイトル:', '').trim();
    else if (line.startsWith('サブタイトル')) subtitle = line.replace(/^サブタイトル.*?[:：]/, '').trim();
    else if (line === '---') { bodyStart = i + 1; break; }
  }
  return { title, subtitle, body: lines.slice(bodyStart).join('\n').trim() };
}

(async () => {
  const filePath = process.argv[2];
  const noteUrl = process.argv[3];
  if (!filePath || !noteUrl) {
    console.error('Usage: node note-update.js <markdown-file> <note-url>');
    process.exit(1);
  }

  const { title, subtitle, body } = parseArticle(filePath);
  console.log(`📝 タイトル: ${title}`);
  console.log(`📄 本文: ${body.length} 文字`);

  // 既存プロファイルで開いている Chrome を先に閉じる
  const { execSync } = require('child_process');
  try { execSync(`pkill -f "note-chrome-profile"`, { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800)); } catch (_) {}

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  }).catch(() => chromium.launchPersistentContext(PROFILE_DIR, { headless: false }));

  const page = await context.newPage();

  // 編集URLを構築（note-idを抽出して editor.note.com 形式に）
  const noteId = noteUrl.match(/\/n\/([a-z0-9]+)$/)?.[1];
  if (!noteId) {
    console.error('❌ note URLからIDを取得できません:', noteUrl);
    await context.close(); process.exit(1);
  }
  const editUrl = `https://note.com/notes/${noteId}/edit`;
  console.log(`\n🚀 編集ページを開きます: ${editUrl}`);

  await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  console.log('現在URL:', page.url());

  // ログイン確認
  if (page.url().includes('login')) {
    console.log('⚠️  セッション切れ。note-chrome-profileでログインし直してください。');
    await context.close(); process.exit(1);
  }

  // ProseMirrorエディターが出るまで待つ
  await page.waitForSelector('.ProseMirror', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // 本文を全選択して削除 → 新しい本文を貼り付け
  console.log('✍️  本文を書き換え中...');
  const bodyEl = await page.waitForSelector('.ProseMirror', { timeout: 10000 });
  await bodyEl.click();
  await page.evaluate(t => navigator.clipboard.writeText(t), body);
  await page.keyboard.down('Meta');
  await page.keyboard.press('a');
  await page.keyboard.up('Meta');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(500);
  await page.keyboard.down('Meta');
  await page.keyboard.press('v');
  await page.keyboard.up('Meta');
  await page.waitForTimeout(1500);

  // 下書き保存
  console.log('💾 下書き保存中...');
  const saveBtn = page.locator('button').filter({ hasText: /^下書き保存$/ }).first();
  if (await saveBtn.count() > 0) {
    await saveBtn.click();
    await page.waitForTimeout(2000);
    console.log('✅ 下書き保存完了');
  } else {
    await page.keyboard.down('Meta'); await page.keyboard.press('s'); await page.keyboard.up('Meta');
    await page.waitForTimeout(2000);
    console.log('✅ Cmd+Sで保存');
  }

  // 公開に進む → 更新する（既存公開記事の更新）
  console.log('\n🚀 公開に進む...');
  const publishBtn = page.locator('button:has-text("公開に進む")');
  if (await publishBtn.count() > 0) {
    await publishBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/note-update-publish.png' });
    console.log('スクリーンショット: /tmp/note-update-publish.png');

    // 「更新する」または「投稿する」ボタン
    const updateBtn = page.locator('button').filter({ hasText: /^更新する$|^投稿する$/ });
    if (await updateBtn.count() > 0) {
      const btnText = await updateBtn.first().textContent();
      console.log(`📤 「${btnText}」ボタンをクリック...`);
      await updateBtn.first().click();
      await page.waitForTimeout(4000);
      console.log('✅ 更新完了！');
    } else {
      console.log('⚠️  更新ボタンが見つかりません');
      const btns = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t)
      );
      console.log('利用可能ボタン:', btns);
    }
  } else {
    console.log('⚠️  「公開に進む」ボタンが見つかりません');
  }

  await page.screenshot({ path: '/tmp/note-update-done.png' });
  console.log('スクリーンショット: /tmp/note-update-done.png');
  console.log(`\n🔗 記事URL: ${noteUrl}`);

  await page.waitForTimeout(2000);
  await context.close();
  console.log('完了');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
