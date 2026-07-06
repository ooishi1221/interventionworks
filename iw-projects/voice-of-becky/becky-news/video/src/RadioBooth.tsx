// 深夜ラジオブース — ニュースの「呼吸するスタジオ」と対極の静けさ（アンナ設計）。
// 静的レイヤー3枚 + 動的1点（ランプ光量の呼吸）のみ。グリッド/ホロリング/モート/スキャンラインは入れない。
// 全て frame の純関数（CSS animation / Math.random / 実時間 禁止）。
const K = 1080 / 405;
const W = 405;
const H = 720;

// --- 調整ノブ（後から盛る時はここだけ触る） ---
const WALL_TOP = "#22242c"; // ブース壁グラデ上端
const WALL_BASE = "#1a1c22"; // ブース壁ベース（紺〜チャコール）
const AMBER = "#e8a34d"; // 卓上ランプ
const GREEN = "#3ddc97"; // 番組緑（ON AIR 縁取りのみ、極小面積）
const LAMP = { x: 330, y: 560, r: 150 }; // 光だまり中心・半径
const LAMP_OP_MIN = 0.35;
const LAMP_OP_MAX = 0.55;
const LAMP_PERIOD = 90; // sin(frame/90)
const STAR_COUNT = 7;
const WINDOW = { x: 40, y: 90, w: 220, h: 200 }; // 窓枠

// 星: 黄金角で決定的配置（窓内のみ）
const frac = (v: number) => v - Math.floor(v);
const STARS = Array.from({ length: STAR_COUNT }, (_, i) => ({
  x: WINDOW.x + 12 + frac(i * 0.618034) * (WINDOW.w - 24),
  y: WINDOW.y + 10 + frac(i * 0.381966) * (WINDOW.h * 0.45),
  r: 0.8 + (i % 3) * 0.4,
  op: 0.4 + frac(i * 0.618034) * 0.4,
}));

// 窓外の低ビルシルエット（固定 path、窓の下半分）
const bx = WINDOW.x, by = WINDOW.y, bw = WINDOW.w, bh = WINDOW.h;
const skyline = `M ${bx} ${by + bh} L ${bx} ${by + bh * 0.72} h 28 v -18 h 20 v 18 h 14 v -34 h 26 v 12 h 16 v 22 h 22 v -26 h 18 v 26 h 12 v -14 h 24 v 14 h 20 v -20 h 20 v ${bh * 0.28 + 20} Z`;

export const RadioBooth: React.FC<{ frame: number }> = ({ frame }) => {
  // 動的1点: ランプ光量の呼吸
  const lampOp = LAMP_OP_MIN + (Math.sin(frame / LAMP_PERIOD) * 0.5 + 0.5) * (LAMP_OP_MAX - LAMP_OP_MIN);

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
        background: `linear-gradient(180deg, ${WALL_TOP} 0%, ${WALL_BASE} 55%, #14151a 100%)`,
      }}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", top: 0, left: 0 }}>
        {/* 窓: 夜空 + 星 + ビルシルエット + 枠 */}
        <rect x={WINDOW.x} y={WINDOW.y} width={WINDOW.w} height={WINDOW.h} rx={6} fill="#0c0e16" />
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#cfd8e6" opacity={s.op} />
        ))}
        <path d={skyline} fill="#12141c" />
        {/* ビルの窓明かり（数点、固定） */}
        <g fill={AMBER} opacity={0.35}>
          <rect x={bx + 34} y={by + bh * 0.72 - 12} width={3} height={3} />
          <rect x={bx + 78} y={by + bh * 0.72 - 26} width={3} height={3} />
          <rect x={bx + 132} y={by + bh * 0.72 - 18} width={3} height={3} />
          <rect x={bx + 180} y={by + bh * 0.72 - 8} width={3} height={3} />
        </g>
        <rect x={WINDOW.x} y={WINDOW.y} width={WINDOW.w} height={WINDOW.h} rx={6} fill="none" stroke="#2c2f3a" strokeWidth={4} />
        <line x1={WINDOW.x + WINDOW.w / 2} y1={WINDOW.y} x2={WINDOW.x + WINDOW.w / 2} y2={WINDOW.y + WINDOW.h} stroke="#2c2f3a" strokeWidth={2} />
      </svg>
      {/* 卓上ランプの光だまり（呼吸） */}
      <div
        style={{
          position: "absolute",
          left: LAMP.x - LAMP.r,
          top: LAMP.y - LAMP.r,
          width: LAMP.r * 2,
          height: LAMP.r * 2,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${AMBER} 0%, transparent 70%)`,
          opacity: lampOp,
        }}
      />
      {/* ON AIR サイン（常時点灯、緑は縁取りのみ） */}
      <div
        style={{
          position: "absolute",
          right: 28,
          top: 36, // ヘッドドレスに食われない高さ（ロゴと同段の右端）
          padding: "5px 12px",
          border: `1.5px solid ${GREEN}`,
          borderRadius: 3,
          color: GREEN,
          fontSize: 12,
          letterSpacing: 3,
          fontFamily: "'Hiragino Sans', sans-serif",
          fontWeight: 700,
          background: "rgba(61,220,151,0.06)",
        }}
      >
        ON AIR
      </div>
    </div>
  );
};
