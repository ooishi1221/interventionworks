// 「呼吸するスタジオ」— アンナ設計の動的背景。back UI よりさらに奥の最下層。
// Remotion 決定的レンダリング: 全て frame の純関数（CSS animation / Math.random / 実時間 禁止）。
const K = 1080 / 405;
const W = 405;
const H = 720;
const GREEN = "#3ddc97";

// --- グリッド地平線（静的）: 画面下1/3、消失点は画面外上方 ---
const VP = { x: W / 2, y: -400 };
const GRID_TOP = H - H / 3; // 480
const rays: string[] = [];
for (let i = 0; i <= 10; i++) {
  const xb = -200 + (i * (W + 400)) / 10; // 画面幅より広く振って端まで格子が届くように
  const t = (H - GRID_TOP) / (H - VP.y);
  const xt = xb + (VP.x - xb) * t;
  rays.push(`M ${xb} ${H} L ${xt.toFixed(1)} ${GRID_TOP}`);
}
// 地平線に近づくほど詰まる横線（パース圧縮 t^2）
const gridHorizontals = [0, 0.14, 0.32, 0.55, 0.8, 1].map(
  (t) => GRID_TOP + (H - GRID_TOP) * t * t
);

// --- 浮遊モート 14個: 黄金角で決定的配置。ヘッダー帯(top120)・テロップ帯(bottom96)を避ける ---
const frac = (v: number) => v - Math.floor(v);
const MOTES = Array.from({ length: 14 }, (_, i) => ({
  baseX: 12 + frac(i * 0.618034) * (W - 24),
  baseY: 135 + frac(i * 0.381966) * 400, // y: 135〜535（テロップ帯 y≈607 以下・ヘッダー帯 y≦120 を回避）
  r: 1 + (i % 3) * 0.5, // 直径 2〜4px
  phase: (i * 137.5 * Math.PI) / 180,
  op: 0.1 + frac(i * 0.618034) * 0.15, // 上限 0.25
}));

export const BeckyBackground: React.FC<{ frame: number }> = ({ frame }) => {
  // 呼吸グロー: 0.05〜0.18 を往復（半径固定）
  const glowOp = 0.05 + (Math.sin(frame / 90) * 0.5 + 0.5) * 0.13;
  // CRT 垂直同期ライン: 下から上へループ
  const scanY = H - ((frame * 1.2) % H);

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
      {/* 呼吸グロー（モデル背後中央） */}
      <div
        style={{
          position: "absolute",
          left: W / 2 - 180,
          top: 220,
          width: 360,
          height: 360,
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
        {/* グリッド地平線（静的） */}
        <g stroke={GREEN} strokeWidth={0.5} opacity={0.08} fill="none">
          {rays.map((d, i) => (
            <path key={`r${i}`} d={d} />
          ))}
          {gridHorizontals.map((y, i) => (
            <line key={`h${i}`} x1={0} y1={y} x2={W} y2={y} />
          ))}
        </g>
        {/* CRT 垂直同期ライン */}
        <line x1={0} y1={scanY} x2={W} y2={scanY} stroke={GREEN} strokeWidth={1} opacity={0.06} />
        {/* 浮遊モート */}
        {MOTES.map((m, i) => (
          <circle
            key={`m${i}`}
            cx={m.baseX + Math.sin(frame * 0.02 + m.phase) * 8}
            cy={m.baseY}
            r={m.r}
            fill={GREEN}
            opacity={m.op}
          />
        ))}
        {/* 静的フィルムグレイン（動かさない） */}
        <rect width={W} height={H} filter="url(#bg-grain)" opacity={0.03} />
      </svg>
    </div>
  );
};
