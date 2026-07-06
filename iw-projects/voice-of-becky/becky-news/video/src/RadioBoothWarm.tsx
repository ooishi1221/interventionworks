// 暖色ラジオブース（1920x1080）— ハイブリッド版: 背景=AI生成画像（booth-warm-bg.png、Gemini/sample01参照）、机=コード。
// layer="back" は画像+ポスター+ON AIR 呼吸グローを1コンテナで crop 拡大（狭い小部屋感）。layer="front" は木目デスク+小物（SVG続投）。
// 動的1点主義: ON AIR グローの呼吸のみ。全て frame の純関数。
import { Img, staticFile } from "remotion";

const W = 1920;
const H = 1080;

// --- 調整ノブ ---
const ONAIR_ORANGE = "#ff9a3c"; // 画像内サインのオレンジに合わせたグロー色
const ONAIR_GLOW = { x: 152, y: 162, rx: 150, ry: 85 }; // 画像内 ON AIR の中心（元画像座標。crop 拡大コンテナ内なのでそのまま）
const GLOW_OP_MIN = 0.1;
const GLOW_OP_MAX = 0.38;
const GLOW_PERIOD = 90; // sin(frame/90)
// 部屋を狭く: 背景画像を作り直さず crop 拡大。ON AIR（左上）・調整室窓（中央）・白壁（右、モデル背面）が残るバランス
const BG_SCALE = 1.3;
const BG_TX = -40; // 左へ寄せる量（ON AIR サインが切れない限界近く）
const BG_TY = -100; // 上へ寄せる量（天井を少し詰める）
// 白壁のポスター2枚（元画像座標。crop 拡大に追従して壁に貼り付いたままになる）
const POSTER1 = { x: 1262, y: 256, w: 152, h: 214, rot: -1.5 }; // Becky's Cast 番組ロゴ（ダーク地×緑）
const POSTER2 = { x: 1330, y: 505, w: 114, h: 152, rot: 2 }; // 白地の番組案内（ロゴの右下に段違いで）
// デスク: 背景画像の暖色照明（右が明るい）から浮かないよう彩度低め+暖色シャドウ
const DESK_TOP = "#9a7a52"; // ナチュラル木目天板（彩度落とし）
const DESK_FACE = "#6e5638"; // デスク前面
const DESK_Y = 840; // デスク奥エッジの左端 y（ここから下が前景で隠れる）
const DESK_TILT = 95; // 右端が左端より下がる量(px)。0で水平に戻る
const TOP_DEPTH = 180; // 天板の見え幅（奥エッジ→前面境界）。広い机の手前奥行き
const edgeY = (x: number) => DESK_Y + DESK_TILT * (x / W); // 小物の接地補正にも使う
const TILT_DEG = (Math.atan2(DESK_TILT, W) * 180) / Math.PI; // ≈2.8° 接地影・木目をエッジと平行に流す用

// 前景: 木目デスク + 作業机の小物（ノートPC・ヘッドホン・卓上マイク・台本紙・マグ）
// 小物は「奥エッジからの深さ」で接地させ（手前ほど下・大きく）、回転を数度散らして置いた感を出す
const Desk: React.FC = () => (
  <g>
    {/* 天板（広い机: 奥エッジ〜前面境界まで TOP_DEPTH） */}
    <polygon points={`0,${edgeY(0)} ${W},${edgeY(W)} ${W},${edgeY(W) + TOP_DEPTH} 0,${edgeY(0) + TOP_DEPTH}`} fill={DESK_TOP} />
    {/* 前面（残りわずか） */}
    <polygon points={`0,${edgeY(0) + TOP_DEPTH} ${W},${edgeY(W) + TOP_DEPTH} ${W},${H} 0,${H}`} fill={DESK_FACE} />
    {/* 奥エッジのハイライト+木目（天板エッジと平行に流す） */}
    <g transform={`skewY(${TILT_DEG})`}>
      <rect x={0} y={DESK_Y} width={W} height={5} fill="#ffe9c040" />
      <g stroke="#00000022" strokeWidth={2} fill="none">
        <path d={`M 0 ${DESK_Y + 26} q 300 8 640 2 t 700 6 t 580 -4`} />
        <path d={`M 0 ${DESK_Y + 64} q 420 -8 860 0 t 1060 4`} />
        <path d={`M 0 ${DESK_Y + 106} q 360 10 760 3 t 1160 5`} />
        <path d={`M 0 ${DESK_Y + 150} q 500 -6 940 2 t 980 -3`} />
      </g>
      {/* 手前をわずかに沈めて奥行き */}
      <rect x={0} y={DESK_Y + TOP_DEPTH - 30} width={W} height={30} fill="#00000015" />
    </g>
    {/* ノートPC（左奥、ベッキーの方=右を向いて開いてる。こちらへは画面の背面エッジ） */}
    <g transform={`translate(230 ${edgeY(320) + 30}) rotate(-2)`}>
      <ellipse cx={120} cy={30} rx={170} ry={11} fill="#00000028" transform={`rotate(${TILT_DEG} 120 30)`} />
      {/* キーボード面（右=ベッキー側へ伸びる台形） */}
      <polygon points="0,6 252,18 262,48 -10,32" fill="#3a3833" />
      <polygon points="0,6 252,18 262,48 -10,32" fill="none" stroke="#4c4a44" strokeWidth={2.5} />
      {/* 画面パネル（左ヒンジ、右=ベッキー側へ開く。こちらへは背面が斜めに見える） */}
      <polygon points="-6,8 -64,-160 40,-178 66,2" fill="#33322f" />
      <polygon points="-6,8 -64,-160 40,-178 66,2" fill="none" stroke="#4c4a44" strokeWidth={2.5} />
      <circle cx={-4} cy={-84} r={13} fill="#4c4a44" />
    </g>
    {/* ヘッドホン（左中、中ほどの深さに置く） */}
    <g transform={`translate(625 ${edgeY(625) + 80}) rotate(3)`}>
      <ellipse cx={0} cy={42} rx={98} ry={12} fill="#00000030" transform={`rotate(${TILT_DEG} 0 42)`} />
      <path d="M -70 0 A 70 74 0 0 1 70 0" fill="none" stroke="#1c1914" strokeWidth={16} />
      <rect x={-86} y={-12} width={34} height={55} rx={13} fill="#1c1914" />
      <rect x={52} y={-12} width={34} height={55} rx={13} fill="#1c1914" />
      <rect x={-80} y={-6} width={22} height={40} rx={10} fill="#3a362e" />
      <rect x={58} y={-6} width={22} height={40} rx={10} fill="#3a362e" />
    </g>
    {/* 卓上マイク（短いグースネック、モデルの方へ） */}
    <g transform={`translate(950 ${edgeY(950) + 45}) rotate(-1)`}>
      <ellipse cx={0} cy={26} rx={86} ry={13} fill="#00000028" transform={`rotate(${TILT_DEG} 0 26)`} />
      <ellipse cx={0} cy={12} rx={74} ry={15} fill="#221e18" />
      <path d="M 0 4 C 0 -105 55 -145 135 -172" stroke="#2a2620" strokeWidth={16} fill="none" strokeLinecap="round" />
      <g transform="translate(159 -179) rotate(60)">
        <rect x={-24} y={-52} width={48} height={104} rx={24} fill="#221e18" />
        <rect x={-24} y={-52} width={48} height={56} rx={24} fill="#443e34" />
        <g stroke="#221e18" strokeWidth={2.5}>
          <line x1={-16} y1={-38} x2={16} y2={-38} />
          <line x1={-20} y1={-24} x2={20} y2={-24} />
        </g>
      </g>
    </g>
    {/* 台本紙 + ペン + メガネ（中央手前。参考画像まるコピ: 紙の辺は机のエッジラインと平行=rotate(TILT_DEG)、テーパー控えめ） */}
    <g transform={`translate(1180 ${edgeY(1180) + 115}) rotate(${TILT_DEG})`}>
      <rect x={-192} y={-55} width={386} height={110} fill="#d9d2c0" />
      <rect x={-206} y={-48} width={386} height={110} fill="#ece5d4" />
      <g stroke="#b0a892" strokeWidth={3}>
        <line x1={-160} y1={-24} x2={130} y2={-24} />
        <line x1={-168} y1={0} x2={138} y2={0} />
        <line x1={-178} y1={24} x2={60} y2={24} />
        <line x1={-188} y1={46} x2={146} y2={46} />
      </g>
      <ellipse cx={-60} cy={8} rx={28} ry={17} fill="none" stroke="#5e5848" strokeWidth={3} />
      <ellipse cx={0} cy={8} rx={28} ry={17} fill="none" stroke="#5e5848" strokeWidth={3} />
      <rect x={104} y={34} width={122} height={8} rx={4} fill="#26221c" transform="rotate(-12 104 34)" />
    </g>
    {/* マグカップ（右手前、黒。手前なので大きめ） */}
    <g transform={`translate(1660 ${edgeY(1660) + 100}) rotate(2)`}>
      <ellipse cx={0} cy={28} rx={68} ry={12} fill="#00000030" transform={`rotate(${TILT_DEG} 0 28)`} />
      <rect x={-48} y={-96} width={96} height={122} rx={9} fill="#1c1914" />
      <path d="M 48 -72 a 34 30 0 0 1 0 66" fill="none" stroke="#1c1914" strokeWidth={15} />
      <ellipse cx={0} cy={-96} rx={48} ry={11} fill="#3a362e" />
      <text x={0} y={-30} textAnchor="middle" fill="#e0d8c8" fontFamily="'Hiragino Sans', sans-serif" fontWeight={700} fontSize={30}>B</text>
    </g>
    {/* 手前を暖色シャドウで少し沈める（背景の照明に馴染ませる既存手法） */}
    <polygon points={`0,${edgeY(0)} ${W},${edgeY(W)} ${W},${H} 0,${H}`} fill="#2a1c10" opacity={0.18} />
  </g>
);

// ポスター共通の照明馴染ませ（画像の暖色照明に合わせた薄い暖色シャドウ）
const posterWarmOverlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(200deg, rgba(255,214,160,0.10), rgba(90,45,15,0.22))",
};

export const RadioBoothWarm: React.FC<{ frame: number; layer: "back" | "front" }> = ({ frame, layer }) => {
  if (layer === "front") {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", top: 0, left: 0 }}>
        <Desk />
      </svg>
    );
  }
  const glow = GLOW_OP_MIN + (Math.sin(frame / GLOW_PERIOD) * 0.5 + 0.5) * (GLOW_OP_MAX - GLOW_OP_MIN);
  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, overflow: "hidden" }}>
      {/* 画像+ポスター+グローを丸ごと crop 拡大 → 壁・窓・ON AIR が近づいて狭い小部屋感 */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: W,
          height: H,
          transform: `translate(${BG_TX}px, ${BG_TY}px) scale(${BG_SCALE})`,
          transformOrigin: "0 0",
        }}
      >
        <Img src={staticFile("booth-warm-bg.png")} style={{ width: W, height: H, objectFit: "cover" }} />
        {/* ポスター1: Becky's Cast 番組ロゴ（ダーク地×緑タイポ） */}
        <div
          style={{
            position: "absolute",
            left: POSTER1.x,
            top: POSTER1.y,
            width: POSTER1.w,
            height: POSTER1.h,
            transform: `rotate(${POSTER1.rot}deg)`,
            background: "#181614",
            borderRadius: 2,
            boxShadow: "0 5px 14px rgba(50,25,8,0.45)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            fontFamily: "'Hiragino Sans', sans-serif",
          }}
        >
          <div style={{ color: "#3ddc97", fontSize: 24, fontWeight: 800, letterSpacing: 1 }}>Becky&apos;s</div>
          <div style={{ color: "#3ddc97", fontSize: 34, fontWeight: 800, letterSpacing: 4 }}>CAST</div>
          <div style={{ width: 60, height: 2, background: "#3ddc9766", margin: "6px 0" }} />
          <div style={{ color: "#cfc8b8", fontSize: 10, letterSpacing: 2 }}>EVERY NIGHT</div>
          <div style={posterWarmOverlay} />
        </div>
        {/* ポスター2: 白地の番組案内 */}
        <div
          style={{
            position: "absolute",
            left: POSTER2.x,
            top: POSTER2.y,
            width: POSTER2.w,
            height: POSTER2.h,
            transform: `rotate(${POSTER2.rot}deg)`,
            background: "#efe7d6",
            borderRadius: 2,
            boxShadow: "0 4px 12px rgba(50,25,8,0.4)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontFamily: "'Hiragino Sans', sans-serif",
          }}
        >
          <div style={{ color: "#26221c", fontSize: 22, fontWeight: 800, letterSpacing: 3 }}>ON AIR</div>
          <div style={{ width: 46, height: 2, background: "#26221c33" }} />
          <div style={{ color: "#4a443a", fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>毎晩 22:00</div>
          <div style={posterWarmOverlay} />
        </div>
        {/* 画像内 ON AIR サインに重ねる呼吸グロー（点滅の生きてる感だけコードで足す） */}
        <div
          style={{
            position: "absolute",
            left: ONAIR_GLOW.x - ONAIR_GLOW.rx,
            top: ONAIR_GLOW.y - ONAIR_GLOW.ry,
            width: ONAIR_GLOW.rx * 2,
            height: ONAIR_GLOW.ry * 2,
            borderRadius: "50%",
            background: `radial-gradient(ellipse, ${ONAIR_ORANGE} 0%, transparent 65%)`,
            opacity: glow,
          }}
        />
      </div>
    </div>
  );
};
