#!/usr/bin/env node
/**
 * make-thumbnail.js — ベッキーアイコン + タイトルの note サムネイル生成
 *
 * Usage:
 *   node make-thumbnail.js "タイトル" [--out /tmp/thumb.png]
 *
 * Output: 1280×670px PNG (note 推奨サイズ)
 */

const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const ICON_PATH = path.join(__dirname, '../../../../../../gazo/becky_x_icon.png');
const NOTE_ICON_PATH = path.resolve('/Volumes/SSD2TB/gazo/becky_x_icon.png');

const W = 1280, H = 670;
const BG     = '#0d0d14';
const ACCENT = '#64dcbe';
const TEXT   = '#e8e8f0';
const SUB    = '#8888aa';

function wrapText(ctx, text, maxWidth) {
  const words = text.split('');
  const lines = [];
  let line = '';

  for (const char of words) {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line.length > 0) {
      lines.push(line);
      line = char;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function makeThumbnail(title, outPath) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // 背景
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // 左側アクセントライン
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, 6, H);

  // グラデーション（右に向かって薄まる）
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, 'rgba(100, 220, 190, 0.08)');
  grad.addColorStop(0.5, 'rgba(100, 220, 190, 0.02)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ベッキーアイコン（右側）
  try {
    const iconSrc = fs.existsSync(NOTE_ICON_PATH) ? NOTE_ICON_PATH : ICON_PATH;
    const icon = await loadImage(iconSrc);
    const iconSize = 280;
    const iconX = W - iconSize - 80;
    const iconY = (H - iconSize) / 2;

    // 円形クリップ
    ctx.save();
    ctx.beginPath();
    ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(icon, iconX, iconY, iconSize, iconSize);
    ctx.restore();

    // 円の縁（mint）
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
    ctx.stroke();
  } catch (e) {
    // アイコン読み込み失敗は無視
  }

  // テキストエリア（左側）
  const textAreaW = W - 380 - 80;

  // ブランド名
  ctx.fillStyle = ACCENT;
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('ベッキー / Becky', 80, 120);

  // 連載名
  ctx.fillStyle = SUB;
  ctx.font = '20px sans-serif';
  ctx.fillText('連載「ベッキーをベッキーにしていく」', 80, 158);

  // タイトル（大きく）
  ctx.fillStyle = TEXT;
  const fontSize = title.length <= 20 ? 64 : title.length <= 30 ? 52 : 44;
  ctx.font = `bold ${fontSize}px sans-serif`;
  const lines = wrapText(ctx, title, textAreaW);
  const lineH = fontSize * 1.4;
  const totalH = lines.length * lineH;
  const startY = (H - totalH) / 2 + 20;

  lines.slice(0, 3).forEach((line, i) => {
    ctx.fillText(line, 80, startY + i * lineH);
  });

  // 下部ライン
  ctx.fillStyle = ACCENT;
  ctx.fillRect(80, H - 50, 60, 3);
  ctx.fillStyle = SUB;
  ctx.font = '18px sans-serif';
  ctx.fillText('beckyexists.com', 80, H - 25);

  // 書き出し
  const out = outPath || `/tmp/becky_thumb_${Date.now()}.png`;
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(out, buffer);
  console.log(`✅ サムネイル: ${out}  (${W}×${H}px)`);
  return out;
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
  const title = args.filter((_, i) => i !== outIdx && i !== outIdx + 1).join(' ');

  if (!title) {
    console.error('Usage: node make-thumbnail.js "タイトル" [--out path.png]');
    process.exit(1);
  }

  makeThumbnail(title, outPath).catch(e => {
    console.error('❌', e.message);
    process.exit(1);
  });
}

module.exports = { makeThumbnail };
