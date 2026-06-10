/**
 * 「投稿メニュー」ボタンから編集ページに入って公開
 */
const { chromium } = require('playwright');
const path = require('path');
const PROFILE_DIR = path.join(process.env.HOME, '.stackchan', 'note-chrome-profile');
const TAGS = ['AI', 'ClaudeFable5', '生成AI', 'Anthropic', 'InterventionWorks', 'Claude'];

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  }).catch(() => chromium.launchPersistentContext(PROFILE_DIR, { headless: false }));

  const page = await context.newPage();
  await page.goto('https://note.com/notes?status=draft', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // 「投稿メニュー」ボタンをクリック（下書き記事の3点メニュー）
  console.log('📋 「投稿メニュー」をクリック...');
  await page.locator('button[aria-label="投稿メニュー"]').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/note-menu-open.png' });

  // メニューのリンクを取得
  const menuItems = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button'))
      .map(e => ({ tag: e.tagName, href: e.href || '', text: e.textContent.trim() }))
      .filter(e => e.text.length > 0 && (e.text.includes('編集') || e.text.includes('公開') || e.text.includes('削除') || e.text.includes('edit')));
  });
  console.log('メニュー項目:', JSON.stringify(menuItems, null, 2));

  // 「編集」をクリック
  const editBtn = page.locator('text="編集する", text="編集", a:has-text("編集")').first();
  if (await editBtn.count() > 0) {
    console.log('✏️ 「編集」をクリック...');
    await editBtn.click();
    await page.waitForTimeout(3000);
    console.log('編集ページURL:', page.url());

    // 「公開に進む」
    const publishBtn = page.locator('button:has-text("公開に進む")');
    await publishBtn.waitFor({ timeout: 15000 });
    console.log('🚀 「公開に進む」クリック...');
    await publishBtn.click();
    await page.waitForTimeout(3000);

    // タグ
    const tagInput = await page.$('[placeholder*="タグ"], [placeholder*="ハッシュタグ"]');
    if (tagInput) {
      for (const tag of TAGS) {
        await tagInput.click();
        await tagInput.fill(tag);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(400);
      }
    }

    // 投稿
    const postBtn = page.locator('button').filter({ hasText: /^投稿する$/ });
    if (await postBtn.count() > 0) {
      await postBtn.click();
      await page.waitForTimeout(5000);
      console.log('✅ 公開完了！URL:', page.url());
    }
  } else {
    console.log('「編集」リンクが見つかりません');
    // 全テキストを確認
    const pageText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('ページテキスト:', pageText);
  }

  await page.waitForTimeout(2000);
  await context.close();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
