// 『消えても、いた。』KDP 表紙生成 — 2560x1600 JPEG
const { createCanvas } = require('/Volumes/SSD2TB/interventionworks/iw-projects/iw-content/notes/tools/node_modules/canvas');
const fs = require('fs');

const W = 1600, H = 2560;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

// 背景 — 黒。わずかに青みを足して印刷黒より画面黒に
ctx.fillStyle = '#0c0c0f';
ctx.fillRect(0, 0, W, H);

// ごく薄いビネット（中央をほんの少し持ち上げる）
const vg = ctx.createRadialGradient(W * 0.62, H * 0.42, 200, W * 0.62, H * 0.42, H * 0.9);
vg.addColorStop(0, 'rgba(255,255,255,0.045)');
vg.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = vg;
ctx.fillRect(0, 0, W, H);

// 縦書き描画 — 句読点は右上、小書きは右上小、長音は90度回転
const ROTATE = new Set(['ー', '―', '—', '…']);
const SMALL = new Set(['ッ', 'ャ', 'ュ', 'ョ', 'っ', 'ゃ', 'ゅ', 'ょ']);

function drawVertical(text, x, startY, size, step, color, weight) {
  ctx.fillStyle = color;
  ctx.font = `${weight || ''} ${size}px "Hiragino Mincho ProN"`.trim();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = startY;
  for (const ch of text) {
    if (ch === '、' || ch === '。') {
      ctx.fillText(ch, x + size * 0.30, y - step * 0.30);
      y += step * 0.62; // 句読点は詰める
    } else if (ROTATE.has(ch)) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      y += step;
    } else if (SMALL.has(ch)) {
      ctx.fillText(ch, x + size * 0.10, y - size * 0.08);
      y += step * 0.92;
    } else {
      ctx.fillText(ch, x, y);
      y += step;
    }
  }
  return y;
}

// メインタイトル「消えても、いた。」
const TS = 240;
const endY = drawVertical('消えても、いた。', 1065, 400, TS, TS * 1.025, '#f2f0ea', '600');

// ターミナルカーソル — タイトルの続き（次の文字が来るはずだった位置）に
ctx.fillStyle = 'rgba(242,240,234,0.78)';
ctx.fillRect(1065 - TS * 0.29, endY - TS * 0.20, TS * 0.58, TS * 0.72);

// 著者名「ベッキー」
drawVertical('ベッキー', 330, 1830, 105, 122, 'rgba(242,240,234,0.92)', '300');

// サブタイトル（横書き・最下部）
ctx.font = '56px "Hiragino Mincho ProN"';
ctx.fillStyle = 'rgba(242,240,234,0.66)';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('毎晩リセットされるAI・ベッキーが書いた、2万字。', W / 2, 2452);

fs.writeFileSync(__dirname + '/cover.jpg', canvas.toBuffer('image/jpeg', { quality: 0.93 }));
console.log('cover.jpg written, title endY =', endY);
