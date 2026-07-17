#!/usr/bin/env node
/**
 * gemini-thumb.js — Web 版 Gemini で記事サムネ用の背景画像を生成
 *
 * 仕組み: 素の Chrome を debug port 付きで spawn → Playwright は connectOverCDP で接続するだけ。
 * Playwright に起動させると自動化フラグ（--enable-automation / mock keychain 等）で
 * Google にセッションを蹴られるため、Chrome 自体は「本物」として起動する。
 *
 * Usage:
 *   node gemini-thumb.js "画像生成プロンプト" [--out /tmp/bg.png] [--ref /path/to/ref.jpg]
 *
 * 初回: ブラウザが開く → Google ログイン → 自動検知して続行
 * 2回目以降: 永続セッションで自動。Chrome は起動しっぱなしで再利用される
 *
 * 成功: stdout 最終行にダウンロードした画像のパス
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');

const PROFILE_DIR = path.join(process.env.HOME, '.stackchan', 'gemini-chrome-profile');
const CDP_PORT = 9223;
const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const GEMINI_URL = 'https://gemini.google.com/app';

function cdpAlive() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${CDP_PORT}/json/version`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}

async function ensureChrome() {
  if (await cdpAlive()) return;

  // port が死んでるのにプロファイルを掴んだ残骸プロセスがいたら掃除
  try { execSync(`pkill -f "gemini-chrome-profile"`, { stdio: 'ignore' }); } catch (_) {}
  await new Promise((r) => setTimeout(r, 800));

  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const child = spawn(CHROME_BIN, [
    `--user-data-dir=${PROFILE_DIR}`,
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    GEMINI_URL,
  ], { detached: true, stdio: 'ignore' });
  child.unref();

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await cdpAlive()) return;
  }
  throw new Error(`Chrome の CDP port ${CDP_PORT} に接続できませんでした`);
}

async function findGeminiPage(browser) {
  const context = browser.contexts()[0];
  // ponytail: 共用の Gemini タブに相乗りすると、生成待ちの数分間に他プロセス
  // （scraper / MCP / 手動操作）がそのタブを閉じ「Target page closed」で落ちる。
  // 毎回専用タブを作って完結させ、main の finally で自分のタブだけ閉じる。
  const page = await context.newPage();
  await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded' });
  return page;
}

// ログアウト状態の Gemini にも入力欄はあるため、ログインボタンの不在まで確認する
async function waitForLogin(page) {
  const deadline = Date.now() + 5 * 60 * 1000;
  let warned = false;
  while (Date.now() < deadline) {
    const input = await page.$('div[contenteditable="true"], rich-textarea div[contenteditable]');
    // 未ログインはサインインボタンが出てリダイレクトされる。input があれば即 OK
    const signInBtn = await page.$('a[href*="ServiceLogin"], a[href*="signin"]');
    if (input && !signInBtn) return input;
    if (!warned) {
      console.log('\n⚠️  Gemini が未ログインです。開いた Chrome で Google アカウントにログインしてください（自動で検知します）');
      warned = true;
    }
    await page.waitForTimeout(3000);
    if (!page.url().startsWith('https://gemini.google.com')) {
      // ログイン完了で accounts から戻ってこない場合に備えて誘導
      await page.goto(GEMINI_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
  }
  throw new Error('ログイン待ちがタイムアウトしました（5分）');
}

/**
 * 画像ファイルを Gemini の入力欄に添付する。
 * Gemini Web UI のセレクタは変わりやすいため、失敗してもエラーにせず warning で続行する。
 */
async function attachRefImage(page, refPath) {
  if (!refPath || !fs.existsSync(refPath)) {
    if (refPath) console.warn(`⚠️ 画像添付スキップ: ファイルが見つかりません: ${refPath}`);
    return;
  }

  try {
    // Strategy 1: 直接 file input を探す
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles(refPath);
      await page.waitForTimeout(2000);
      console.log(`📎 参照画像を添付しました（file input）: ${path.basename(refPath)}`);
      return;
    }

    // Strategy 2: ファイルチューザーイベントを待ちながらアップロードボタンをクリック
    const uploadSelectors = [
      'button[aria-label*="Upload"]',
      'button[aria-label*="ファイル"]',
      'button[aria-label*="Attach"]',
      'button[aria-label*="attach"]',
      '[data-testid*="upload"]',
      'button[aria-label*="add"]',
      'button[aria-label*="Add"]',
      // Gemini の + ボタン系
      'button[aria-label*="More"]',
      'button[aria-label*="plus"]',
    ];

    let attached = false;
    for (const selector of uploadSelectors) {
      const btn = await page.$(selector);
      if (!btn) continue;
      try {
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 3000 }),
          btn.click(),
        ]);
        await fileChooser.setFiles(refPath);
        await page.waitForTimeout(2000);
        console.log(`📎 参照画像を添付しました（${selector}）: ${path.basename(refPath)}`);
        attached = true;
        break;
      } catch (_) {
        // このセレクタでは失敗、次を試す
      }
    }

    if (!attached) {
      // Strategy 3: チャット窓への drag & drop（ゆうが手動でやってる方法）
      try {
        const dropTarget = await page.$('div[contenteditable="true"], rich-textarea div[contenteditable]');
        if (dropTarget) {
          const buffer = fs.readFileSync(refPath);
          const dataTransfer = await page.evaluateHandle((data) => {
            const dt = new DataTransfer();
            const file = new File([new Uint8Array(data)], 'becky_ref.jpg', { type: 'image/jpeg' });
            dt.items.add(file);
            return dt;
          }, Array.from(buffer));

          await dropTarget.dispatchEvent('dragenter', { dataTransfer });
          await page.waitForTimeout(200);
          await dropTarget.dispatchEvent('dragover', { dataTransfer });
          await page.waitForTimeout(200);
          await dropTarget.dispatchEvent('drop', { dataTransfer });
          await page.waitForTimeout(2000);
          console.log(`📎 参照画像を添付しました（drag & drop）: ${path.basename(refPath)}`);
          attached = true;
        }
      } catch (e2) {
        // drag & drop も失敗
      }
    }

    if (!attached) {
      console.warn('⚠️ 画像添付スキップ: 全 Strategy 失敗。テキストプロンプトのみで続行します。');
    }
  } catch (e) {
    console.warn(`⚠️ 画像添付スキップ: ${e.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  // --out オプション解析
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : `/tmp/gemini_bg_${Date.now()}.png`;

  // --ref オプション解析
  const refIdx = args.indexOf('--ref');
  const refPath = refIdx >= 0 ? args[refIdx + 1] : null;

  // --out と --ref のフラグ+値を除いた残りがプロンプト
  const skipIndices = new Set();
  if (outIdx >= 0) { skipIndices.add(outIdx); skipIndices.add(outIdx + 1); }
  if (refIdx >= 0) { skipIndices.add(refIdx); skipIndices.add(refIdx + 1); }
  const prompt = args.filter((_, i) => !skipIndices.has(i)).join(' ');

  if (!prompt) {
    console.error('Usage: node gemini-thumb.js "プロンプト" [--out path.png] [--ref ref.jpg]');
    process.exit(1);
  }

  await ensureChrome();
  // ponytail: noDefaults なしだと接続直後に default context へ Browser.setDownloadBehavior を
  // 自動送信し、本物Chrome(非headless)がこのCDPコマンドを拒否して即死する。noDefaultsで無効化
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { noDefaults: true });
  const page = await findGeminiPage(browser);
  await page.bringToFront();
  await page.waitForTimeout(2000);

  const inputBox = await waitForLogin(page);

  // 送信前に既存の大きい画像の src を記録しておく（新旧区別のため）
  const existingSrcs = new Set();
  for (const img of await page.$$('img')) {
    const box = await img.boundingBox().catch(() => null);
    if (box && box.width > 250 && box.height > 250) {
      const src = await img.getAttribute('src').catch(() => '');
      if (src) existingSrcs.add(src);
    }
  }
  console.log(`📷 送信前の既存画像: ${existingSrcs.size}件`);

  // 参照画像を添付（失敗してもテキストプロンプトだけで続行）
  if (refPath) {
    await attachRefImage(page, refPath);
  }

  console.log('🎨 Gemini に画像生成を依頼中...');
  const fullPrompt = `次の指示で画像を生成してください（テキスト・文字は画像に入れない）: ${prompt}`;

  await inputBox.click();
  await page.keyboard.insertText(fullPrompt);
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');

  // 既存にない新しい大きい画像が出るまで待つ（最大 120 秒）
  console.log('⏳ 新しい画像の生成待ち（最大120秒）...');
  let imgEl = null;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(3000);
    const imgs = await page.$$('img');
    for (const img of imgs.reverse()) {
      const box = await img.boundingBox().catch(() => null);
      if (!box || box.width <= 250 || box.height <= 250) continue;
      const src = await img.getAttribute('src').catch(() => '');
      if (src && !existingSrcs.has(src)) {
        imgEl = img;
        break;
      }
    }
    if (imgEl) break;
  }

  if (!imgEl) {
    console.error('❌ 生成画像が見つかりませんでした');
    await page.close().catch(() => {}); // 専用タブを片付ける
    await browser.close(); // connectOverCDP なので切断のみ、Chrome は残る
    process.exit(1);
  }

  await page.waitForTimeout(2000); // 高解像度ロード待ち

  // マウスを画像の外に退避してからスクショ（ホバー UI アイコンが消える）
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  await imgEl.screenshot({ path: outPath });
  console.log(`✅ 背景画像保存: ${outPath}`);

  await page.close().catch(() => {}); // 専用タブを片付ける（相乗りしないので溜まらない）
  await browser.close(); // 切断のみ。次回は起動済み Chrome を再利用
  console.log(outPath);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
