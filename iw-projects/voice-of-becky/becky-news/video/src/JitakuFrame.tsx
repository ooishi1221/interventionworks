// ベキたん「自宅から配信」フレーム（1920x1080）— stream-frame/mock-jitaku.html の Remotion 移植。
// レイアウト座標・色は mock が正本。CSS animation は全部 frame の純関数に変換。
// layer="back" = 部屋(Ken Burns)+LED呼吸 / layer="front" = テレビ・机・お題帯・ヘッダー（Live2D の手前）。
// テレビ窓は tvContent prop で off(暗い画面+走査線) / img1 / img2 を切替。tvFlash(0..1) で切替フラッシュ。
import { Img, staticFile } from "remotion";

const W = 1920;
const H = 1080;

// --- 調整ノブ（mock の :root 変数） ---
const GREEN = "#3ddc97";
const GREEN_HI = "#5cffb0";
const LIVE_RED = "#e0245e";
const PANEL = "rgba(10, 14, 12, 0.72)";
const PANEL_BORDER = "#24352c";
const INK = "#eeeeee";
const INK_DIM = "#8a9e93";
const MONO = "Menlo, monospace";
const SANS = "'Hiragino Sans', 'Noto Sans JP', sans-serif";
const TV_W = 520; // テレビ筐体幅
const DESK_H = 300; // 机の高さ
const DESK_TILT = -0.5; // 机パース傾き(deg)
const DEFAULT_TOPIC = "最近ハマってる技術は？"; // ponytail: ルーレットは動画では静止1題（主役の邪魔）

export type TvContent = "off" | "img1" | "img2";

const DEFAULT_TV_IMG: Record<string, string> = { img1: "img1-radiobooth.png", img2: "img2-news.png" };

// mock の @keyframes を frame 純関数に
const kenburnsScale = (frame: number) => {
  // 46s 片道 alternate → 92s 周期の三角波で 1.0..1.03
  const p = (frame / 30) % 92;
  const tri = p < 46 ? p / 46 : (92 - p) / 46;
  return 1 + 0.03 * tri;
};
const ledBreath = (frame: number) => 0.05 + 0.11 * (0.5 - 0.5 * Math.cos((frame / 30 / 7) * 2 * Math.PI)); // 7s 呼吸
const livePulse = (frame: number) => ((frame / 30) % 1.2 < 0.6 ? 1 : 0.35); // 1.2s steps
const tvFlicker = (frame: number) => {
  const p = ((frame / 30) % 9) / 9; // 9s 周期、たまにチラつく
  if (p >= 0.91 && p < 0.93) return 0.78;
  if (p >= 0.96 && p < 0.97) return 0.68;
  return 0.5;
};
const scanbarTop = (frame: number, h: number) => -60 + (((frame / 30) % 5) / 5) * (h + 60); // 5s で降下
const steamAt = (frame: number, delay: number) => {
  const p = (((frame / 30 + delay) % 3.4) + 3.4) % 3.4 / 3.4;
  return { y: -26 * p, sy: 0.6 + 0.55 * p, op: p < 0.4 ? (p / 0.4) * 0.7 : 0.7 * (1 - (p - 0.4) / 0.6) };
};

const scanlines: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  background: "repeating-linear-gradient(0deg, rgba(0,0,0,.16) 0 2px, transparent 2px 4px)",
};

export const JitakuFrame: React.FC<{
  frame: number;
  layer: "back" | "front";
  tvContent?: TvContent;
  tvFlash?: number; // 0..1 切替フラッシュ
  topicEmphasis?: number; // 0..1 お題帯の強調（Bブロック）
  topic?: string;
  epNum?: string;
  tvImg?: Record<string, string>;
}> = ({ frame, layer, tvContent = "off", tvFlash = 0, topicEmphasis = 0, topic = DEFAULT_TOPIC, epNum = "#000", tvImg = DEFAULT_TV_IMG }) => {
  if (layer === "back") {
    return (
      <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, overflow: "hidden", background: "#0a0d0b" }}>
        {/* 部屋（Ken Burns） */}
        <Img
          src={staticFile("room-bg.png")}
          style={{ position: "absolute", inset: 0, width: W, height: H, objectFit: "cover", transform: `scale(${kenburnsScale(frame)})` }}
        />
        {/* 部屋のLEDに重ねる呼吸グロー */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: ledBreath(frame),
            background: `radial-gradient(ellipse 900px 160px at 52% 8%, ${GREEN} 0%, transparent 70%), radial-gradient(ellipse 420px 260px at 47% 55%, ${GREEN} 0%, transparent 70%), radial-gradient(ellipse 700px 200px at 88% 20%, ${GREEN} 0%, transparent 70%)`,
          }}
        />
      </div>
    );
  }

  const st1 = steamAt(frame, 0);
  const st2 = steamAt(frame, 1.7);
  const emph = topicEmphasis;

  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, fontFamily: SANS, color: INK, pointerEvents: "none" }}>
      {/* テレビ発光の机への落ち */}
      <div
        style={{
          position: "absolute",
          left: 30,
          top: 730,
          width: 580,
          height: 120,
          background: "radial-gradient(ellipse at center, rgba(61, 220, 151, 0.18) 0%, transparent 70%)",
          opacity: ledBreath(frame) * 6, // 呼吸を同期（mock は同 keyframes）
        }}
      />

      {/* ============ 左: レトロテレビ ============ */}
      <div
        style={{
          position: "absolute",
          left: 56,
          top: 165,
          width: TV_W,
          height: 600,
          transform: "perspective(1600px) rotateY(3deg)",
          transformOrigin: "left center",
          background: "linear-gradient(160deg, #4a4238 0%, #2e2820 45%, #1c1712 100%)",
          borderRadius: 22,
          padding: "18px 18px 46px",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,.12), 0 2px 4px rgba(0,0,0,.5), 0 18px 40px rgba(0,0,0,.55), 18px 30px 80px rgba(0,0,0,.45), 0 0 90px rgba(61, 220, 151, 0.14)",
        }}
      >
        {/* 画面 */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            background: "rgba(6, 12, 9, 0.92)",
            borderRadius: 14,
            border: "1px solid #101a14",
            boxShadow: "inset 0 0 30px rgba(0,0,0,.8), inset 0 0 60px rgba(61, 220, 151, 0.08)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* タブヘッダ（見た目だけ。IMAGE がアクティブ） */}
          <div style={{ flexShrink: 0, display: "flex", borderBottom: `1px solid ${PANEL_BORDER}`, fontFamily: MONO, fontSize: 13, letterSpacing: "0.18em" }}>
            <span style={{ padding: "12px 20px", color: INK_DIM }}>COMMENT</span>
            <span style={{ padding: "12px 20px", color: GREEN, borderBottom: `2px solid ${GREEN}`, textShadow: "0 0 8px rgba(61, 220, 151, 0.6)" }}>
              📺 IMAGE
            </span>
          </div>
          {/* 中身 */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            {tvContent !== "off" ? (
              <Img src={staticFile(tvImg[tvContent])} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              /* 消えてる画面: 中央にぼんやり残光だけ */
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, rgba(61,220,151,0.05) 0%, transparent 60%)" }} />
            )}
            {/* スキャンバー */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                height: 60,
                top: scanbarTop(frame, 490),
                background: "linear-gradient(180deg, transparent, rgba(92, 255, 176, 0.06), transparent)",
              }}
            />
          </div>
          {/* 走査線 + ちらつき（画像の上にも乗せてブラウン管感） */}
          <div style={{ ...scanlines, opacity: tvFlicker(frame) }} />
          {/* ガラス反射 */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background: "linear-gradient(115deg, transparent 30%, rgba(255,255,255,.07) 42%, rgba(255,255,255,.02) 50%, transparent 60%)",
            }}
          />
          {/* 切替フラッシュ */}
          {tvFlash > 0 && <div style={{ position: "absolute", inset: 0, background: "#dfffee", opacity: tvFlash * 0.85 }} />}
        </div>
        {/* 銘板 + 電源LED + 脚 */}
        <span style={{ position: "absolute", bottom: 14, left: 30, fontFamily: MONO, fontSize: 12, letterSpacing: "0.3em", color: "rgba(255, 240, 210, 0.45)" }}>
          BK-1983
        </span>
        <span
          style={{
            position: "absolute",
            bottom: 18,
            right: 30,
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: GREEN_HI,
            boxShadow: "0 0 8px 2px rgba(92, 255, 176, 0.6)",
          }}
        />
        <span style={{ position: "absolute", bottom: -32, left: 60, width: 22, height: 34, background: "linear-gradient(180deg, #2e2820, #14100c)", borderRadius: "0 0 5px 5px", transform: "skewX(6deg)" }} />
        <span style={{ position: "absolute", bottom: -32, right: 60, width: 22, height: 34, background: "linear-gradient(180deg, #2e2820, #14100c)", borderRadius: "0 0 5px 5px", transform: "skewX(-6deg)" }} />
      </div>

      {/* ============ 前層: 自宅デスク（腰下隠し） ============ */}
      <div
        style={{
          position: "absolute",
          left: -40,
          right: -40,
          bottom: -26,
          height: DESK_H,
          transform: `rotate(${DESK_TILT}deg)`,
          transformOrigin: "center top",
          background:
            "linear-gradient(180deg, rgba(61, 220, 151, 0.2) 0%, transparent 40%), repeating-linear-gradient(92deg, transparent 0 90px, rgba(0,0,0,.18) 90px 93px, transparent 93px 160px), linear-gradient(180deg, #4d3a2a 0%, #2c2016 30%, #2b1e15 100%)",
          boxShadow: "0 -2px 0 rgba(120, 220, 180, 0.22), 0 -6px 18px rgba(0,0,0,.55), 0 -20px 50px rgba(0,0,0,.4)",
        }}
      >
        {/* ぬいぐるみ */}
        <div
          style={{
            position: "absolute",
            left: 560,
            top: -62,
            width: 78,
            height: 68,
            background: "radial-gradient(circle at 38% 32%, #57c99a 0%, #2c6e52 70%, #1d4a37 100%)",
            borderRadius: "48% 48% 44% 44%",
            boxShadow: "0 8px 12px rgba(0,0,0,.5)",
          }}
        >
          <div style={{ position: "absolute", top: -14, left: 8, width: 24, height: 24, borderRadius: "50%", background: "radial-gradient(circle at 40% 35%, #57c99a, #234f3b)" }} />
          <div style={{ position: "absolute", top: -14, right: 8, width: 24, height: 24, borderRadius: "50%", background: "radial-gradient(circle at 40% 35%, #57c99a, #234f3b)" }} />
          <div style={{ position: "absolute", left: 20, top: 22, color: "#10281d", fontSize: 13, letterSpacing: 14 }}>• •</div>
        </div>
        {/* マグカップ（B ロゴ）+ 湯気 */}
        <div
          style={{
            position: "absolute",
            left: 700,
            top: -74,
            width: 92,
            height: 84,
            background: "linear-gradient(180deg, #2a3d33 0%, #16241d 100%)",
            borderRadius: "8px 8px 14px 14px",
            boxShadow: "inset 0 6px 0 rgba(0,0,0,.5), inset -8px 0 14px rgba(0,0,0,.35), inset 4px 0 8px rgba(61, 220, 151, 0.15), 0 10px 14px rgba(0,0,0,.5)",
          }}
        >
          <div style={{ position: "absolute", right: -26, top: 16, width: 30, height: 42, border: "9px solid #1d2f26", borderLeft: "none", borderRadius: "0 20px 20px 0" }} />
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -46%)", fontFamily: MONO, fontSize: 34, fontWeight: 700, color: GREEN, textShadow: "0 0 8px rgba(61, 220, 151, 0.5)" }}>
            B
          </div>
        </div>
        <div style={{ position: "absolute", left: 736, top: -120, width: 4, height: 40, borderRadius: 4, background: "linear-gradient(180deg, transparent, rgba(255,255,255,.25))", transform: `translateY(${st1.y}px) scaleY(${st1.sy})`, opacity: st1.op }} />
        <div style={{ position: "absolute", left: 756, top: -120, width: 4, height: 32, borderRadius: 4, background: "linear-gradient(180deg, transparent, rgba(255,255,255,.25))", transform: `translateY(${st2.y}px) scaleY(${st2.sy})`, opacity: st2.op }} />
        {/* キーボードの端 */}
        <div
          style={{
            position: "absolute",
            right: 20,
            top: 14,
            width: 560,
            height: 110,
            background: "linear-gradient(180deg, #1b1b20 0%, #101014 100%)",
            borderRadius: 10,
            transform: "rotate(-2deg)",
            boxShadow: "0 8px 14px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 12,
              background: "repeating-linear-gradient(90deg, #26262e 0 44px, #0d0d11 44px 50px), repeating-linear-gradient(0deg, transparent 0 30px, #0d0d11 30px 36px)",
              borderRadius: 6,
              boxShadow: "inset 0 0 20px rgba(61, 220, 151, 0.12)",
            }}
          />
        </div>
        {/* スマホ（伏せ置き、通知LED） */}
        <div
          style={{
            position: "absolute",
            left: 1310,
            top: -10,
            width: 150,
            height: 74,
            background: "linear-gradient(180deg, #23232a, #101014)",
            borderRadius: 12,
            transform: "rotate(4deg)",
            boxShadow: "0 8px 12px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.1)",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: 14,
              top: 10,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: GREEN_HI,
              boxShadow: "0 0 6px 2px rgba(92, 255, 176, 0.5)",
              opacity: (frame / 30) % 2.4 < 1.2 ? 1 : 0,
            }}
          />
        </div>
      </div>

      {/* ============ 下端: お題帯（動画では静止1題 + emphasis で強調） ============ */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 138,
          background: `rgba(8, 13, 10, ${0.78 + emph * 0.1})`,
          borderTop: `${2 + emph * 2}px solid ${GREEN}`,
          boxShadow: `0 -8px 30px rgba(0,0,0,.5), inset 0 1px 0 rgba(92, 255, 176, ${0.25 + emph * 0.4}), 0 0 ${emph * 40}px rgba(61,220,151,${emph * 0.35})`,
          display: "flex",
          alignItems: "center",
          transform: `scale(${1 + emph * 0.02})`,
          transformOrigin: "center bottom",
        }}
      >
        <div style={{ flexShrink: 0, alignSelf: "stretch", display: "flex", alignItems: "center", background: GREEN, color: "#0a0d0b", fontSize: 16, fontWeight: 800, letterSpacing: "0.16em", padding: "0 26px" }}>
          お題
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 46 + emph * 4,
            fontWeight: 800,
            letterSpacing: "0.04em",
            color: INK,
            textShadow: `0 0 14px rgba(61, 220, 151, ${0.35 + emph * 0.45})`,
          }}
        >
          {topic}
        </div>
        <span style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: 210, width: 10, height: 26, background: GREEN, boxShadow: "0 0 10px rgba(61, 220, 151, 0.7)", clipPath: "polygon(0 0, 100% 50%, 0 100%)" }} />
        <span style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", right: 40, width: 10, height: 26, background: GREEN, boxShadow: "0 0 10px rgba(61, 220, 151, 0.7)", clipPath: "polygon(100% 0, 0 50%, 100% 100%)" }} />
      </div>

      {/* ============ 上部左: LIVE + タイトル ============ */}
      <div
        style={{
          position: "absolute",
          top: 32,
          left: 44,
          display: "flex",
          alignItems: "center",
          gap: 14,
          background: PANEL,
          border: `1px solid ${PANEL_BORDER}`,
          borderLeft: `4px solid ${GREEN}`,
          padding: "11px 22px 11px 15px",
          boxShadow: "0 4px 10px rgba(0,0,0,.45), 0 18px 40px rgba(0,0,0,.35)",
        }}
      >
        <span style={{ background: LIVE_RED, color: "#fff", fontSize: 15, fontWeight: 800, letterSpacing: "0.12em", padding: "3px 10px", opacity: livePulse(frame) }}>
          ● LIVE
        </span>
        <span style={{ fontSize: 21, fontWeight: 900, letterSpacing: "0.02em" }}>
          ベキたん家から雑談 <span style={{ color: GREEN }}>{epNum}</span>
        </span>
      </div>
    </div>
  );
};
