// 横長ラジオブース（1920x1080）— ネオンパープル×マゼンタの夜スタジオ（ゆうFB: images.jpg 参照）。
// 3層: layer="back"（壁・窓・ON AIRネオン・スポット光）→ Live2D → layer="front"（機材卓・ミキサー・マイク）。
// 前景は暗め（手前ボケ風）でモデルの腰下を隠し「卓に座ってる」を成立させる。
// 動的1点主義: ON AIR ネオンの呼吸のみ。全て frame の純関数。
const W = 1920;
const H = 1080;

// --- 調整ノブ ---
const WALL_TOP = "#2a1a4a"; // 壁グラデ上端（ダークパープル）
const WALL_BASE = "#0f0a20"; // 壁ベース
const PANEL = "#3b2a66"; // 機材パネル紫
const PANEL_DK = "#241a45"; // 機材影
const NEON = "#ff4fd8"; // ON AIR ピンクネオン
const MAGENTA = "#d81fff"; // スポット光
const GREEN = "#3ddc97"; // 番組緑（極小面積のみ）
const DESK_Y = 840; // 機材卓の上端（ここから下が前景で隠れる。下の空白詰め済み）
const NEON_OP_MIN = 0.8;
const NEON_OP_MAX = 1.0;
const GLOW_PERIOD = 90; // sin(frame/90)
const MODEL_GLOW = { x: 1350, y: 520, r: 340 }; // モデル背後の紫グロー（MODEL_X と合わせる）

// レンガ: CSS repeating-gradient で目地（紫トーン）
const brickBg = `
  linear-gradient(180deg, ${WALL_TOP} 0%, ${WALL_BASE} 100%)`;

const Window: React.FC = () => (
  // 調整室のガラス窓（左）: 紫トーン、中に機材シルエットうっすら
  <g>
    <rect x={80} y={190} width={560} height={400} rx={6} fill="#150e2e" />
    <g fill="#2a1e52">
      <rect x={110} y={430} width={500} height={160} />
      <rect x={160} y={330} width={90} height={100} rx={6} />
      <rect x={280} y={310} width={110} height={120} rx={6} />
      <rect x={440} y={340} width={80} height={90} rx={6} />
      <rect x={540} y={250} width={8} height={180} />
    </g>
    <circle cx={560} cy={340} r={28} fill={MAGENTA} opacity={0.25} />
    {/* ガラス反射 */}
    <polygon points="140,190 300,190 120,590 80,590" fill="#c9f" opacity={0.06} />
    <polygon points="400,190 470,190 240,590 190,590" fill="#c9f" opacity={0.04} />
    <rect x={80} y={190} width={560} height={400} rx={6} fill="none" stroke="#42327a" strokeWidth={13} />
    <line x1={360} y1={190} x2={360} y2={590} stroke="#42327a" strokeWidth={7} />
  </g>
);

// 前景: 機材卓（ミキサー・フェーダー・モニタ2面・ヘッドホン・マイクアーム）、紫トーン+暗め
const Console: React.FC = () => (
  <g>
    {/* 卓の天板帯 + 前面 */}
    <rect x={0} y={DESK_Y} width={W} height={54} fill={PANEL_DK} />
    <rect x={0} y={DESK_Y + 54} width={W} height={H - DESK_Y - 54} fill="#120c26" />
    <rect x={0} y={DESK_Y} width={W} height={5} fill="#8a5fff30" />
    {/* 左モニタ（画面に紫の渦） */}
    <g transform={`translate(150 ${DESK_Y - 178})`}>
      <rect x={0} y={0} width={360} height={196} rx={10} fill={PANEL_DK} stroke="#4a3788" strokeWidth={5} />
      <rect x={22} y={18} width={316} height={148} rx={6} fill="#170f33" />
      <path d="M 60 120 q 60 -70 120 -20 t 120 -30" stroke={MAGENTA} strokeWidth={5} fill="none" opacity={0.5} />
      <path d="M 80 140 q 70 -50 140 -10" stroke="#8a5fff" strokeWidth={3} fill="none" opacity={0.4} />
    </g>
    {/* ヘッドホン（左モニタに掛かる） */}
    <g transform={`translate(210 ${DESK_Y - 60})`}>
      <path d="M -62 0 A 62 66 0 0 1 62 0" fill="none" stroke="#120c28" strokeWidth={15} />
      <rect x={-78} y={-10} width={32} height={50} rx={12} fill="#120c28" />
      <rect x={46} y={-10} width={32} height={50} rx={12} fill="#120c28" />
      <rect x={-72} y={-4} width={20} height={36} rx={9} fill={PANEL} />
      <rect x={52} y={-4} width={20} height={36} rx={9} fill={PANEL} />
    </g>
    {/* 中央ミキサー（フェーダー6本+ノブ列） */}
    <g transform={`translate(680 ${DESK_Y - 128})`}>
      <rect x={0} y={0} width={560} height={150} rx={10} fill={PANEL} stroke="#5a44a0" strokeWidth={4} />
      {Array.from({ length: 6 }, (_, i) => (
        <g key={i} transform={`translate(${52 + i * 82} 22)`}>
          <rect x={-3} y={0} width={6} height={72} rx={3} fill="#170f33" />
          <rect x={-15} y={14 + (i * 13) % 40} width={30} height={14} rx={4} fill="#c9b8ff" />
        </g>
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <circle key={i} cx={60 + i * 64} cy={122} r={11} fill="#170f33" stroke="#8a5fff" strokeWidth={2.5} />
      ))}
      {/* インジケータ LED 列（番組緑はここだけ極小） */}
      <g>
        <circle cx={510} cy={26} r={5} fill={NEON} />
        <circle cx={510} cy={46} r={5} fill={GREEN} />
      </g>
    </g>
    {/* 右モニタ */}
    <g transform={`translate(1560 ${DESK_Y - 178})`}>
      <rect x={0} y={0} width={330} height={196} rx={10} fill={PANEL_DK} stroke="#4a3788" strokeWidth={5} />
      <rect x={20} y={18} width={290} height={148} rx={6} fill="#170f33" />
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={44 + i * 28} y={140 - (i % 4) * 22 - 18} width={14} height={(i % 4) * 22 + 20} fill={MAGENTA} opacity={0.45} />
      ))}
    </g>
    {/* マイクアーム（卓からモデルの口元へ） */}
    <g stroke="#0d081f" strokeLinecap="round" fill="none">
      <line x1={900} y1={DESK_Y + 10} x2={980} y2={710} strokeWidth={22} />
      <line x1={980} y1={710} x2={1120} y2={688} strokeWidth={18} />
    </g>
    <circle cx={980} cy={710} r={14} fill="#1c1240" />
    <g transform="translate(1140 680) rotate(35)">
      <rect x={-26} y={-58} width={52} height={116} rx={26} fill="#120c28" />
      <rect x={-26} y={-58} width={52} height={64} rx={26} fill={PANEL} />
      <g stroke="#120c28" strokeWidth={2.5}>
        <line x1={-18} y1={-44} x2={18} y2={-44} />
        <line x1={-22} y1={-30} x2={22} y2={-30} />
        <line x1={-22} y1={-16} x2={22} y2={-16} />
      </g>
    </g>
    {/* 手前ボケ風の暗がり（前景全体をうっすら沈める） */}
    <rect x={0} y={DESK_Y - 220} width={W} height={H - DESK_Y + 220} fill="#0a0618" opacity={0.22} />
  </g>
);

export const RadioBoothWide: React.FC<{ frame: number; layer: "back" | "front" }> = ({ frame, layer }) => {
  if (layer === "front") {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", top: 0, left: 0 }}>
        <Console />
      </svg>
    );
  }
  const glow = NEON_OP_MIN + (Math.sin(frame / GLOW_PERIOD) * 0.5 + 0.5) * (NEON_OP_MAX - NEON_OP_MIN);
  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, background: brickBg, overflow: "hidden" }}>
      {/* マゼンタスポット光（左上、images.jpg のランプ位置） */}
      <div
        style={{
          position: "absolute",
          left: -160,
          top: -200,
          width: 640,
          height: 640,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${MAGENTA} 0%, transparent 65%)`,
          opacity: 0.3,
        }}
      />
      {/* モデル背後の紫グロー（緑髪と補色で映える） */}
      <div
        style={{
          position: "absolute",
          left: MODEL_GLOW.x - MODEL_GLOW.r,
          top: MODEL_GLOW.y - MODEL_GLOW.r,
          width: MODEL_GLOW.r * 2,
          height: MODEL_GLOW.r * 2,
          borderRadius: "50%",
          background: "radial-gradient(circle, #8a5fff 0%, transparent 68%)",
          opacity: 0.32,
        }}
      />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", top: 0, left: 0 }}>
        {/* 壁レンガ目地（紫、subtle） */}
        <g stroke="#3a2a6a" strokeWidth={2} opacity={0.35}>
          {Array.from({ length: 12 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i * 92} x2={W} y2={i * 92} />
          ))}
          {Array.from({ length: 24 }, (_, i) => (
            <line key={`v${i}`} x1={((i * 160 + (i % 2) * 80) % W)} y1={(i % 12) * 92} x2={((i * 160 + (i % 2) * 80) % W)} y2={(i % 12) * 92 + 92} />
          ))}
        </g>
        <Window />
        {/* ケーブル（天井から垂れる、images.jpg 風） */}
        <g stroke="#1c1240" strokeWidth={5} fill="none" opacity={0.8}>
          <path d="M 760 0 q 20 140 -10 260" />
          <path d="M 1560 0 q -16 100 12 200" />
        </g>
        {/* ON AIR ネオンサイン（左寄せ上部=モデル頭と被らない、ピンクネオン発光・呼吸） */}
        <g opacity={glow}>
          <rect x={670} y={36} width={400} height={132} rx={14} fill="#0d081f" stroke="#42327a" strokeWidth={7} />
          <rect x={692} y={56} width={356} height={92} rx={8} fill="#160b2a" />
          {/* ネオン発光: 同一テキストを4重に重ねてグロー */}
          {[26, 14, 6, 0].map((blur, i) => (
            <text
              key={i}
              x={870}
              y={126}
              textAnchor="middle"
              fill={i === 3 ? "#ffe6fa" : NEON}
              fontFamily="'Hiragino Sans', sans-serif"
              fontWeight={800}
              fontSize={58}
              letterSpacing={12}
              opacity={i === 3 ? 1 : 0.55}
              filter={blur ? `blur(${blur}px)` : undefined}
              style={blur ? { filter: `blur(${blur}px)` } : undefined}
            >
              ON AIR
            </text>
          ))}
          <rect x={670} y={36} width={400} height={132} rx={14} fill={NEON} opacity={0.06} />
        </g>
      </svg>
    </div>
  );
};
