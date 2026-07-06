import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

const G = "#3ddc97";
const CX = 540, CY = 900, R = 360;

// ホログラム地球儀のドット（緯度経度格子を球に投影、経度をフレームで回す）。決定的。
const globeDots = (rotDeg: number) => {
  const dots: { x: number; y: number; op: number; r: number }[] = [];
  const rot = (rotDeg * Math.PI) / 180;
  for (let lat = -75; lat <= 75; lat += 15) {
    const la = (lat * Math.PI) / 180;
    for (let lon = 0; lon < 360; lon += 15) {
      const lo = (lon * Math.PI) / 180 + rot;
      const x3 = Math.cos(la) * Math.sin(lo);
      const z3 = Math.cos(la) * Math.cos(lo); // >0 = 手前
      const y3 = Math.sin(la);
      dots.push({ x: CX + x3 * R, y: CY - y3 * R, op: z3 > 0 ? 0.85 : 0.12, r: z3 > 0 ? 3 : 2 });
    }
  }
  return dots;
};

export const Opener: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const dots = globeDots(frame * 0.7);
  // バイナリの雨（シード固定ハッシュで配置、フレームで下方向へ）
  const cols = 18, colW = 1080 / cols, step = 46;
  const rain: { x: number; y: number; c: string; op: number }[] = [];
  for (let c = 0; c < cols; c++) {
    const seed = (c * 37) % 100;
    for (let k = 0; k < 40; k++) {
      const y = ((k * step + frame * (6 + (seed % 5)) + seed * 7) % (1920 + step)) - step;
      rain.push({ x: c * colW + 8, y, c: (c * 7 + k * 13) % 5 === 0 ? "1" : "0", op: 0.06 + ((k + seed) % 4) * 0.05 });
    }
  }

  // タイトルのスラムイン（scale+opacityスナップ）
  const slam = (start: number) => {
    const s = interpolate(frame, [start, start + 4], [1.4, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const o = frame >= start ? 1 : 0;
    return { transform: `scale(${s})`, opacity: o };
  };

  return (
    <div style={{ position: "absolute", inset: 0, background: "#0a0a12", overflow: "hidden" }}>
      <svg width="1080" height="1920" style={{ position: "absolute", inset: 0 }}>
        {/* 軌道リング（傾き違い・ゆっくり回転） */}
        {[{ rx: 470, ry: 150, rot: frame * 0.6 }, { rx: 430, ry: 210, rot: -frame * 0.4 + 40 }, { rx: 500, ry: 100, rot: frame * 0.3 + 80 }].map((o, i) => (
          <ellipse key={i} cx={CX} cy={CY} rx={o.rx} ry={o.ry} fill="none" stroke={G} strokeWidth={1.2} opacity={0.35}
            transform={`rotate(${o.rot} ${CX} ${CY})`} />
        ))}
        {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={G} opacity={d.op} />)}
        {rain.map((r, i) => (
          <text key={i} x={r.x} y={r.y} fill={G} opacity={r.op} fontSize={22} fontFamily="Menlo,monospace">{r.c}</text>
        ))}
      </svg>

      {/* 左上 LIVE チップ */}
      <div style={{ position: "absolute", top: 60, left: 48, background: "#e0245e", color: "#fff", fontWeight: 800, fontSize: 30, padding: "6px 18px", letterSpacing: 3, fontFamily: '"Hiragino Sans",sans-serif' }}>● LIVE</div>

      {/* 中央2段スラムイン */}
      <div style={{ position: "absolute", top: 820, left: 0, right: 0, textAlign: "center", fontFamily: '"Hiragino Sans",sans-serif' }}>
        <div style={{ display: "inline-block", background: G, color: "#0a0a12", fontWeight: 900, fontSize: 110, padding: "4px 40px", letterSpacing: 6, ...slam(8) }}>BECKY</div>
        <div style={{ marginTop: 18 }}>
          <span style={{ display: "inline-block", background: "#fff", color: "#0a0a12", fontWeight: 900, fontSize: 88, padding: "4px 36px", letterSpacing: 6, ...slam(16) }}>AI NEWS</span>
        </div>
        <div style={{ marginTop: 26, color: G, fontFamily: "Menlo,monospace", fontSize: 26, opacity: frame >= 26 ? 0.8 : 0 }}>▶ BREAKING</div>
      </div>
    </div>
  );
};
