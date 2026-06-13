/**
 * ヘッダー「投稿▼」ドロップダウンから下書きをクリックして公開
 */
const { chromium } = require('playwright');
const path = require('path');
const PROFILE_DIR = path.join(process.env.HOME, '.stackchan', 'note-chrome-profile');
const TAGS = ['AI', '生成AI', 'Kindle', '電子書籍', 'InterventionWorks', 'AIアイドル'];

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  }).catch(() => chromium.launchPersistentContext(PROFILE_DIR, { headless: false }));

  const page = await context.newPage();
  await page.goto('https://note.com/notes?status=draft', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // ヘッダー「投稿▼」をクリック
  console.log('📋 投稿メニューを開きます...');
  await page.locator('button[aria-label="投稿メニュー"]').click();
  await page.waitForTimeout(1500);

  // ドロップダウン内のリンクを確認
  const dropLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .map(e => ({ href: e.href, text: e.textContent.trim().substring(0, 80) }))
      .filter(l => l.text.length > 0);
  });
  console.log('ドロップダウンリンク:', JSON.stringify(dropLinks, null, 2));

  // 記事タイトルを含むリンクをクリック
  const draftLink = dropLinks.find(l => l.text.includes('いくら払') || l.href.includes('/n/'));
  if (draftLink) {
    console.log('✅ 下書きリンク発見:', draftLink);
    await page.goto(draftLink.href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
  } else {
    // テキストをクリック
    console.log('テキストをクリックします...');
    await page.locator('text="いくら払っているか"').click();
    await page.waitForTimeout(3000);
  }

  console.log('移動先URL:', page.url());
  let currentUrl = page.url();

  // 現在のページが編集ページでなければ /edit を追加
  if (!currentUrl.includes('/edit')) {
    if (currentUrl.match(/\/n\/[a-z0-9]+/)) {
      await page.goto(currentUrl + '/edit', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      currentUrl = page.url();
      console.log('編集ページ:', currentUrl);
    }
  }

  // 「公開に進む」
  const publishBtn = page.locator('button:has-text("公開に進む")');
  try {
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

    await page.waitForTimeout(1000);

    // 「投稿する」
    const postBtn = page.locator('button').filter({ hasText: /^投稿する$/ });
    if (await postBtn.count() > 0) {
      await postBtn.click();
      await page.waitForTimeout(6000);
      console.log('✅ 公開完了！URL:', page.url());
      await page.screenshot({ path: '/tmp/note-done.png' });
    } else {
      const btns = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t)
      );
      console.log('ボタン:', btns);
      await page.screenshot({ path: '/tmp/note-no-post.png' });
    }
  } catch (e) {
    console.log('「公開に進む」ボタンなし:', e.message);
    await page.screenshot({ path: '/tmp/note-fallback.png' });
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t)
    );
    console.log('ボタン一覧:', btns);
  }

  await page.waitForTimeout(2000);
  await context.close();
  console.log('完了');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
