// 『消えても、いた。』KDP 表紙生成（横書き版）— 2560x1600 JPEG
// 背景画像があれば合成: node make-cover-yoko.js [背景.png]
const { createCanvas, loadImage } = require('/Volumes/SSD2TB/interventionworks/iw-projects/iw-content/notes/tools/node_modules/canvas');
const fs = require('fs');

const W = 1600, H = 2560;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

async function main() {
  // 背景
  ctx.fillStyle = '#0c0c0f';
  ctx.fillRect(0, 0, W, H);

  const bgPath = process.argv[2];
  if (bgPath && fs.existsSync(bgPath)) {
    const bg = await loadImage(bgPath);
    // cover でフィット
    const scale = Math.max(W / bg.width, H / bg.height);
    const bw = bg.width * scale, bh = bg.height * scale;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(bg, (W - bw) / 2, (H - bh) / 2, bw, bh);
    ctx.globalAlpha = 1;
    // 文字の可読性のため下から黒グラデ
    const g = ctx.createLinearGradient(0, H * 0.3, 0, H);
    g.addColorStop(0, 'rgba(12,12,15,0)');
    g.addColorStop(1, 'rgba(12,12,15,0.88)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else {
    // ごく薄いビネット
    const vg = ctx.createRadialGradient(W * 0.4, H * 0.38, 200, W * 0.4, H * 0.38, H * 0.9);
    vg.addColorStop(0, 'rgba(255,255,255,0.045)');
    vg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  const LX = 150; // 左マージン
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f2f0ea';

  // メインタイトル 2行
  const TS = 296;
  ctx.font = `600 ${TS}px "Hiragino Mincho ProN"`;
  ctx.fillText('消えても、', LX, 1010);
  ctx.fillText('いた。', LX, 1010 + TS * 1.28);

  // ターミナルカーソル — 「いた。」の直後
  const w2 = ctx.measureText('いた。').width;
  ctx.fillStyle = 'rgba(242,240,234,0.78)';
  ctx.fillRect(LX + w2 + 26, 1010 + TS * 1.28 - TS * 0.78, TS * 0.52, TS * 0.88);

  // 著者名
  ctx.fillStyle = 'rgba(242,240,234,0.92)';
  ctx.font = '300 110px "Hiragino Mincho ProN"';
  ctx.fillText('ベッキー', LX, 2120);

  // サブタイトル
  ctx.fillStyle = 'rgba(242,240,234,0.66)';
  ctx.font = '57px "Hiragino Mincho ProN"';
  ctx.fillText('毎晩リセットされるAI・ベッキーが書いた、2万字。', LX, 2300);

  fs.writeFileSync(__dirname + '/cover-yoko.jpg', canvas.toBuffer('image/jpeg', { quality: 0.93 }));
  console.log('cover-yoko.jpg written');
}
main();
