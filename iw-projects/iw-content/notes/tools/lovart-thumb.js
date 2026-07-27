#!/usr/bin/env node
/**
 * lovart-thumb.js — Lovart(GPT Image 2)で画像を生成する
 *
 * 仕組み: gemini-thumb.js と同じ専用Chrome(CDP:9223、gemini-chrome-profile)を再利用する。
 * ゆうが手動でLovartにGoogle連携ログイン済みなので、認証はそのセッションに乗るだけ。
 * 既存のLovartプロジェクトタブ(なければ既定のプロジェクトURLで新規オープン)を使い回す。
 *
 * Usage:
 *   node lovart-thumb.js "画像生成プロンプト" [--out /tmp/img.png]
 *
 * 成功: stdout 最終行にダウンロードした画像のパス
 */

const { chromium } = require('playwright');
const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const CDP_PORT = 9223;
// ponytail: ゆうがログイン済みの既定プロジェクト。将来複数プロジェクトを使い分けるなら引数化する。
const LOVART_URL = 'https://www.lovart.ai/canvas?projectId=oVfOd56Kbu';

function cdpAlive() {
  return new Promise((resolve) => {
    const req = require('http').get(`http://127.0.0.1:${CDP_PORT}/json/version`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}

async function findLovartPage(browser) {
  const context = browser.contexts()[0];
  const existing = context.pages().find((p) => p.url().includes('lovart.ai'));
  if (existing) return existing;
  const page = await context.newPage();
  await page.goto(LOVART_URL, { waitUntil: 'domcontentloaded' });
  return page;
}

function downloadImage(url, outPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        fs.writeFileSync(outPath, Buffer.concat(chunks));
        resolve();
      });
    }).on('error', reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : `/tmp/lovart_${Date.now()}.png`;
  const skip = new Set(outIdx >= 0 ? [outIdx, outIdx + 1] : []);
  const prompt = args.filter((_, i) => !skip.has(i)).join(' ');

  if (!prompt) {
    console.error('Usage: node lovart-thumb.js "プロンプト" [--out path.png]');
    process.exit(1);
  }

  if (!(await cdpAlive())) {
    throw new Error(`Chrome の CDP port ${CDP_PORT} に接続できません（becky-watchdog.sh 経由で起動されているはず）`);
  }

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { noDefaults: true });
  const page = await findLovartPage(browser);
  await page.bringToFront();
  await page.waitForTimeout(1000);
  // ponytail: 告知モーダル(Mantine)が入力欄を覆って click が stable判定されず
  // 30秒timeoutする既知症状(2026-07-24〜26連発)への防御。Escapeで大抵閉じる。
  await page.keyboard.press('Escape').catch(() => {});

  // 送信前の既存画像srcを記録（新旧区別のため）
  const existingSrcs = new Set(
    await page.evaluate(() => Array.from(document.querySelectorAll('img')).map((i) => i.src))
  );

  console.log('🎨 Lovart に画像生成を依頼中...');
  const input = page.locator('[contenteditable="true"], textarea').first();
  try {
    await input.click();
  } catch (e) {
    // ponytail: click timeoutの再現待ちをやめて証拠を残す。次回同症状の切り分け用。
    const shotPath = `/tmp/lovart-thumb-click-failure-${Date.now()}.png`;
    await page.screenshot({ path: shotPath }).catch(() => {});
    console.error(`❌ 入力欄クリック失敗、スクリーンショット保存: ${shotPath}`);
    throw e;
  }
  await page.keyboard.press('Meta+A');
  await page.keyboard.press('Backspace');
  await input.fill(prompt);
  await page.waitForTimeout(500);

  const sendBtn = page.locator('button').filter({ has: page.locator('svg') }).last();
  await sendBtn.click();

  // 新しい画像が出るまで待つ（最大3分、10秒間隔）
  console.log('⏳ 新しい画像の生成待ち（最大180秒）...');
  let newSrc = null;
  for (let i = 0; i < 18; i++) {
    await page.waitForTimeout(10000);
    const srcs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img'))
        .filter((img) => img.naturalWidth > 400)
        .map((img) => img.src)
    );
    const found = srcs.find((s) => s.startsWith('https://a.lovart.ai/') && !existingSrcs.has(s));
    if (found) { newSrc = found; break; }
  }

  if (!newSrc) {
    // ponytail: クレジット切れ等の理由をUI文言から拾えたら区別してログに残す。
    // 見つからなくても汎用エラーとして続行(Lovart側の文言変化に依存する簡易チェック)。
    const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
    const creditHit = bodyText.match(/(クレジット不足|クレジットが不足|insufficient credit|out of credit|no credits?\s*(left|remaining))/i);
    if (creditHit) {
      console.error(`❌ 生成画像が見つかりませんでした（クレジット不足の可能性: 「${creditHit[0]}」を検出）`);
    } else {
      console.error('❌ 生成画像が見つかりませんでした');
    }
    await browser.close();
    process.exit(1);
  }

  // resize/format クエリを外してフル解像度で取得
  const fullResUrl = newSrc.split('?')[0];
  await downloadImage(fullResUrl, outPath);
  console.log(`✅ 画像保存: ${outPath}`);

  await browser.close(); // connectOverCDP なので切断のみ、Chrome/タブは残る（プロジェクト継続のため閉じない）
  console.log(outPath);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
