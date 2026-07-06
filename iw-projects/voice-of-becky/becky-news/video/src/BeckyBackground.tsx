// 「呼吸するスタジオ」v2 — サイバーアイドルのステージ感（ゆうFB「全然わからないw」で増幅）。
// back UI よりさらに奥の最下層。全て frame の純関数（CSS animation / Math.random / 実時間 禁止）。
const K = 1080 / 405;
const W = 405;
const H = 720;
const GREEN = "#3ddc97";

// --- グリッド地平線: 画面下1/3、消失点は画面外上方 ---
const VP = { x: W / 2, y: -400 };
const GRID_TOP = H - H / 3; // 480
const rays: string[] = [];
for (let i = 0; i <= 10; i++) {
  const xb = -200 + (i * (W + 400)) / 10; // 画面幅より広く振って端まで格子が届くように
  const t = (H - GRID_TOP) / (H - VP.y);
  const xt = xb + (VP.x - xb) * t;
  rays.push(`M ${xb} ${H} L ${xt.toFixed(1)} ${GRID_TOP}`);
}

// --- 浮遊モート 24個: 黄金角で決定的配置。ヘッダー帯(top120)・テロップ帯(bottom96)を避ける ---
const frac = (v: number) => v - Math.floor(v);
const MOTES = Array.from({ length: 24 }, (_, i) => ({
  baseX: 12 + frac(i * 0.618034) * (W - 24),
  baseY: 135 + frac(i * 0.381966) * 400, // y: 135〜535
  r: 1.5 + (i % 4) * 0.5, // 直径 3〜6px
  phase: (i * 137.5 * Math.PI) / 180,
  op: 0.15 + frac(i * 0.618034) * 0.4, // 上限 0.55
  halo: i % 3 === 0, // 数個はグローで光らせる
}));

const GLOW_C = { x: W / 2, y: 400 }; // モデル背後中央

export const BeckyBackground: React.FC<{ frame: number }> = ({ frame }) => {
  // 呼吸グロー: 0.10〜0.40 を往復（半径固定）
  const glowOp = 0.1 + (Math.sin(frame / 90) * 0.5 + 0.5) * 0.3;
  // CRT 垂直同期ライン: 下から上へループ
  const scanY = H - ((frame * 1.2) % H);
  // グリッド横線: 地平線から手前へ流れる（レトロウェーブの走るフロア、ループ）
  const floorLines = Array.from({ length: 6 }, (_, i) => {
    const u = frac(i / 6 + frame * 0.0015);
    return { y: GRID_TOP + (H - GRID_TOP) * u * u, op: Math.min(1, u * 3) };
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: W,
        height: H,
        transform: `scale(${K})`,
        transformOrigin: "top left",
        overflow: "hidden",
      }}
    >
      {/* 呼吸グロー */}
      <div
        style={{
          position: "absolute",
          left: GLOW_C.x - 220,
          top: GLOW_C.y - 220,
          width: 440,
          height: 440,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${GREEN} 0%, transparent 70%)`,
          opacity: glowOp,
        }}
      />
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <defs>
          <filter id="bg-grain">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="2"
              stitchTiles="stitch"
            />
          </filter>
        </defs>
        {/* ホロリング（アイドルステージのバックライト、逆回転2層） */}
        <g fill="none" stroke={GREEN}>
          <g opacity={0.1} transform={`rotate(${frame * 0.2} ${GLOW_C.x} ${GLOW_C.y})`}>
            <circle cx={GLOW_C.x} cy={GLOW_C.y} r={120} strokeWidth={1.5} strokeDasharray="34 20" />
            <circle cx={GLOW_C.x} cy={GLOW_C.y} r={158} strokeWidth={1} strokeDasharray="10 26" />
          </g>
          <g opacity={0.09} transform={`rotate(${-frame * 0.13} ${GLOW_C.x} ${GLOW_C.y})`}>
            <circle cx={GLOW_C.x} cy={GLOW_C.y} r={90} strokeWidth={1} strokeDasharray="20 14" />
          </g>
        </g>
        {/* グリッド地平線: 放射は静的、横線は手前へスクロール */}
        <g stroke={GREEN} strokeWidth={0.5} opacity={0.2} fill="none">
          {rays.map((d, i) => (
            <path key={`r${i}`} d={d} />
          ))}
          {floorLines.map((l, i) => (
            <line key={`h${i}`} x1={0} y1={l.y} x2={W} y2={l.y} opacity={l.op} strokeWidth={1} />
          ))}
        </g>
        {/* CRT 垂直同期ライン */}
        <line x1={0} y1={scanY} x2={W} y2={scanY} stroke={GREEN} strokeWidth={1} opacity={0.15} />
        {/* 浮遊モート（一部グロー付き） */}
        {MOTES.map((m, i) => {
          const cx = m.baseX + Math.sin(frame * 0.02 + m.phase) * 8;
          return (
            <g key={`m${i}`}>
              {m.halo && <circle cx={cx} cy={m.baseY} r={m.r * 3} fill={GREEN} opacity={m.op * 0.35} />}
              <circle cx={cx} cy={m.baseY} r={m.r} fill={GREEN} opacity={m.op} />
            </g>
          );
        })}
        {/* 静的フィルムグレイン（動かさない） */}
        <rect width={W} height={H} filter="url(#bg-grain)" opacity={0.03} />
      </svg>
    </div>
  );
};
