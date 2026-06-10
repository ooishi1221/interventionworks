/**
 * 下書きURLを直接指定して公開
 * Usage: node publish-direct.js <note-url>
 */
const { chromium } = require('playwright');
const path = require('path');
const PROFILE_DIR = path.join(process.env.HOME, '.stackchan', 'note-chrome-profile');
const TAGS = ['AI', 'ClaudeFable5', '生成AI', 'Anthropic', 'InterventionWorks', 'Claude'];

const NOTE_URL = process.argv[2] || 'https://note.com/intervention_jp/n/n20ec8181182f';

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  }).catch(() => chromium.launchPersistentContext(PROFILE_DIR, { headless: false }));

  const page = await context.newPage();

  // 編集ページを直接開く
  const editUrl = NOTE_URL.replace(/\/$/, '') + '/edit';
  console.log('📝 編集ページを開きます:', editUrl);
  await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  console.log('現在URL:', page.url());

  // 「公開に進む」ボタンを待つ
  const publishBtn = page.locator('button:has-text("公開に進む")');
  await publishBtn.waitFor({ timeout: 15000 });
  console.log('🚀 「公開に進む」をクリック...');
  await publishBtn.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/note-publish-step.png' });
  console.log('スクリーンショット: /tmp/note-publish-step.png');

  // タグ入力
  const tagInput = await page.$('[placeholder*="タグ"], [placeholder*="ハッシュタグ"]');
  if (tagInput) {
    console.log('🏷 タグ入力中...');
    for (const tag of TAGS) {
      await tagInput.click();
      await tagInput.fill(tag);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    }
    console.log('✅ タグ入力完了');
  } else {
    console.log('⚠️ タグ入力欄なし（スキップ）');
  }

  await page.waitForTimeout(1000);

  // 「投稿する」ボタン
  const postBtn = page.locator('button').filter({ hasText: /^投稿する$/ });
  if (await postBtn.count() > 0) {
    console.log('📤 投稿中...');
    await postBtn.click();
    await page.waitForTimeout(6000);
    const finalUrl = page.url();
    console.log('✅ 公開完了！URL:', finalUrl);
    await page.screenshot({ path: '/tmp/note-done.png' });
  } else {
    console.log('⚠️ 「投稿する」ボタンが見つかりません');
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t)
    );
    console.log('利用可能ボタン:', btns);
    await page.screenshot({ path: '/tmp/note-no-post.png' });
  }

  await page.waitForTimeout(2000);
  await context.close();
  console.log('完了');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
