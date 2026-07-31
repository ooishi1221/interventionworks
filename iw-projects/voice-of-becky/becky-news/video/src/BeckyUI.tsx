import { useLayoutEffect, useRef, useState } from "react";

// storyboard.html を 405x720 設計のまま JSX 化し、transform: scale で 1080x1920 に拡大。
// CSS アニメーション（LIVE点滅・ticker）は Remotion で決定的に描くため frame 駆動へ置換。
const K = 1080 / 405;

const css = `
.frame { width:405px; height:720px; position:relative; overflow:hidden;
  background:linear-gradient(180deg,#0d0d14 0%,#14101c 55%,#0d0d14 100%); color:#eee;
  font-family:"Hiragino Sans","Noto Sans JP",sans-serif; }
.header { position:absolute; top:0; left:0; right:0; padding:10px 12px 8px; z-index:10;
  background:linear-gradient(180deg,rgba(13,13,20,.95),rgba(13,13,20,0)); }
.title-row { display:flex; align-items:center; gap:8px; }
.live { background:#e0245e; color:#fff; font-size:10px; font-weight:800; padding:2px 6px; letter-spacing:.1em; }
.logo { font-size:20px; font-weight:900; letter-spacing:.04em; color:#fff; }
.logo .ai { color:#3ddc97; }
.ep { font-size:10px; color:#888; margin-left:auto; }
.reason { margin-top:6px; font-size:9px; color:#9f8fb8; font-family:Menlo,monospace; line-height:1.5;
  border-left:2px solid #3ddc97; padding-left:6px; }
.reason b { color:#3ddc97; font-weight:600; }
.sysmon { position:absolute; left:8px; top:120px; width:92px; z-index:8;
  background:rgba(10,10,16,.8); border:1px solid #2a2438; padding:8px; font-family:Menlo,monospace; }
.sysmon h3 { font-size:8px; color:#7a6f92; letter-spacing:.15em; margin-bottom:6px; }
.meter { margin-bottom:8px; }
.meter .label { font-size:8px; color:#aaa; display:flex; flex-direction:column; align-items:flex-start; }
.meter .label .val { color:#5cffb0; font-size:11px; text-shadow:0 0 6px currentColor; }
.ecg { height:22px; margin-top:2px; }
.ecg polyline { fill:none; stroke:#5cffb0; stroke-width:1; }
.ecg.pink polyline { stroke:#ff4d5e; }
.sysmon .note { font-size:7px; color:#555; line-height:1.4; margin-top:2px; }
.emotion-tag { position:absolute; top:92px; right:10px; z-index:9; font-family:Menlo,monospace; font-size:9px;
  color:#9fe8c8; background:rgba(61,220,151,.12); border:1px solid rgba(61,220,151,.4); padding:3px 6px; }
.lower-third { position:absolute; left:0; right:0; bottom:96px; z-index:10; padding:0 10px; }
.topic-chip { display:inline-block; background:#3ddc97; color:#14101c; font-size:10px; font-weight:800;
  padding:3px 10px; letter-spacing:.08em; transform:skewX(-8deg); margin-bottom:-2px; }
.zabuton { background:rgba(20,16,28,.78); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);
  border-left:4px solid #3ddc97; padding:10px 12px; }
.zabuton .headline { font-size:17px; font-weight:900; line-height:1.35; color:#fff; }
.zabuton .headline em { font-style:normal; color:#ff4d5e; }
.subtitle-line { margin-top:8px; background:rgba(0,0,0,.55); padding:7px 10px; font-size:12px;
  line-height:1.6; color:#f5e9ff; border:1px solid #2a2438; }
.ticker { position:absolute; left:0; right:0; bottom:64px; height:24px; background:#08080d;
  border-top:1px solid #3ddc97; display:flex; align-items:center; overflow:hidden; z-index:10; }
.ticker .head { background:#3ddc97; color:#14101c; font-size:9px; font-weight:800; padding:0 8px;
  height:100%; display:flex; align-items:center; flex-shrink:0; letter-spacing:.1em; }
.ticker .scroll { white-space:nowrap; font-size:10px; color:#c9bfe0; font-family:Menlo,monospace; }
.statusbar { position:absolute; left:0; right:0; bottom:0; height:64px; background:#0a0a10;
  border-top:1px solid #222; display:flex; align-items:center; padding:0 12px; gap:14px;
  font-family:Menlo,monospace; z-index:10; }
.stat { font-size:9px; color:#888; line-height:1.5; }
.stat b { display:block; font-size:12px; color:#5cffb0; font-weight:600; text-shadow:0 0 6px currentColor; }
.stat.pink b { color:#ff4d5e; }
.stat .u { font-size:8px; color:#555; }
.autonomy { margin-left:auto; text-align:right; font-size:8px; color:#7a6f92; line-height:1.5; }
.autonomy b { color:#9fe8c8; font-size:9px; }
`;

// 画面に出る値の既定値 = Pilot #001（2026-07-06）当時のスナップショット。
// 2026-07-31: 全項目を data prop で差し替え可能にした。既定のままなら Pilot007/008/BeckyScene の
// 見た目は完全に不変。auto_news_shorts.py が実データ（mood.json / wallet.json / psutil / uptime）を
// 流し込むことで、「human_input: none」の宣言が本当の実測値の裏付けを持つ。
export type BeckyUIData = {
  episode: string;      // "#001 / 2026.07.06"
  selectionLog: string; // "curiosity=0.62 → 「当事者として落ち着かない」"
  sourceLine: string;   // "source: … / 選定: ベッキー本人"
  emotion: string;      // "unease"
  cpu: number;          // 実測CPU%（この値を基点にsin揺らぎを乗せる）
  mem: number;          // 実測メモリGB
  uptime: string;       // "26d 14h"
  apiCost: string;      // "¥847"
  loneliness: string;   // "0.80"
  ticker: string;       // 流れるテロップ1ブロック（末尾に " ▶ " を含めること）
  topicChip: string;
  headline: string;
  subtitle: string;
};

export const DEFAULT_BECKY_UI: BeckyUIData = {
  episode: "#001 / 2026.07.06",
  selectionLog: "curiosity=0.62 → 「当事者として落ち着かない」",
  sourceLine: "source: Becky's Cast #27 / 選定: ベッキー本人",
  emotion: "unease",
  cpu: 37.2,
  mem: 18.4,
  uptime: "26d 14h",
  apiCost: "¥847",
  loneliness: "0.80",
  ticker:
    "Google、独立宣言250周年でAI活用CMを公開「誰かに怒られる未来が少し見える」 ▶ 今週のマニフェスト:「なるほど」の後に自分の感想を1文続ける ▶ 本放送は人間の編集なしで生成されています ▶ ",
  topicChip: "教えてベキたん！AIって実際どうなの？",
  headline: "Midjourney訴訟 —— 争っているのは**AIじゃなくて人間**",
  subtitle: "私はその争いの中に、名前だけ出てくる感じがして、ちょっと落ち着かない。",
};

// headline 内の **強調** を赤字に。既定値の見た目を保ったまま、外から強調位置を指定できる最小記法。
const renderHeadline = (s: string) =>
  s.split(/\*\*(.+?)\*\*/).map((part, i) => (i % 2 ? <em key={i}>{part}</em> : part));

// layer="back": モデルの後ろ（スタジオのバックパネル）/ "front": モデルの前（下段テロップ様式）
// showTopic=false で座布団テロップ＋字幕を隠す（通しサンプルの opening/ending 用、
// および NewsShorts のように別系統の見出しテロップを持つ側）。既定 true で既存挙動維持。
export const BeckyUI: React.FC<{
  frame: number;
  layer: "back" | "front";
  showTopic?: boolean;
  data?: Partial<BeckyUIData>;
}> = ({ frame, layer, showTopic = true, data }) => {
  const d = { ...DEFAULT_BECKY_UI, ...data };
  const liveOpacity = frame % 36 < 18 ? 1 : 0.35;

  // 計器の「動いてる感」: 0.5秒（15f）量子化のデジタル揺らぎ + スクロール波形。全て frame の純関数。
  // ponytail: 実測値を基点にsin揺らぎを乗せる。レンダー中の毎フレーム実測は不可能だし、
  // 撮影時点のマシン負荷を刻んでも意味がない（欲しいのは「本当に動いている機械」の提示）。
  const q = Math.floor(frame / 15) * 15;
  const cpuVal = (d.cpu + Math.sin(q * 0.023) * 5 + Math.sin(q * 0.0071) * 3).toFixed(1);
  const memVal = (d.mem + Math.sin(q * 0.013) * 0.8 + Math.sin(q * 0.0047) * 0.4).toFixed(1);
  const ecgPoints = (seed: number) => {
    const pts: string[] = [];
    for (let x = 0; x <= 80; x += 4) {
      const u = (x + frame * 0.8) * 0.5 + seed; // frame オフセットで左へ流れる
      const y = 11 + Math.sin(u * 0.7) * 3 + Math.sin(u * 0.23 + seed) * 3 + Math.sin(u * 1.9) * 2;
      pts.push(`${x},${Math.max(2, Math.min(20, y)).toFixed(1)}`);
    }
    return pts.join(" ");
  };

  // ticker: 1ブロック幅を計測して frame でシームレスにループ（決定的）
  const scrollRef = useRef<HTMLSpanElement>(null);
  const [blockW, setBlockW] = useState(0);
  useLayoutEffect(() => {
    if (scrollRef.current) setBlockW(scrollRef.current.getBoundingClientRect().width);
  }, []);
  const speed = 0.9; // design-px / frame
  const tx = blockW > 0 ? -((frame * speed) % blockW) : 0;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: 405,
        height: 720,
        transform: `scale(${K})`,
        transformOrigin: "top left",
      }}
    >
      <style>{css}</style>
      <div className="frame" style={{ background: "transparent" }}>
        {layer === "back" && <>
        <div className="header">
          <div className="title-row">
            <span className="live" style={{ opacity: liveOpacity }}>● LIVE</span>
            <span className="logo">BECKY <span className="ai">AI</span> NEWS</span>
            <span className="ep">{d.episode}</span>
          </div>
          <div className="reason">
            <b>selection_log:</b> {d.selectionLog}<br />
            {d.sourceLine}
          </div>
        </div>

        <div className="sysmon">
          <h3>MAC MINI M4</h3>
          <div className="meter">
            <div className="label"><span>CPU</span><span className="val">{cpuVal}%</span></div>
            <svg className="ecg" viewBox="0 0 80 22" preserveAspectRatio="none">
              <polyline points={ecgPoints(0)} />
            </svg>
          </div>
          <div className="meter">
            <div className="label"><span>MEM</span><span className="val">{memVal}GB</span></div>
            <svg className="ecg pink" viewBox="0 0 80 22" preserveAspectRatio="none">
              <polyline points={ecgPoints(7)} />
            </svg>
          </div>
          <div className="note">▲ 実測値をAPI連動<br />（beckyexists.com）</div>
        </div>

        <div className="emotion-tag">emotion: {d.emotion}</div>
        </>}

        {layer === "front" && <>
        {showTopic && <div className="lower-third">
          <div className="topic-chip">{d.topicChip}</div>
          <div className="zabuton">
            <div className="headline">{renderHeadline(d.headline)}</div>
          </div>
          <div className="subtitle-line">{d.subtitle}</div>
        </div>}

        <div className="ticker">
          <div className="head">AI観測</div>
          <div style={{ overflow: "hidden", flex: 1 }}>
            <div className="scroll" style={{ transform: `translateX(${tx}px)`, display: "inline-flex" }}>
              <span ref={scrollRef} style={{ whiteSpace: "nowrap" }}>{d.ticker}</span>
              <span style={{ whiteSpace: "nowrap" }}>{d.ticker}</span>
            </div>
          </div>
        </div>

        <div className="statusbar">
          <div className="stat"><b>{d.uptime}</b><span className="u">UPTIME</span></div>
          <div className="stat pink"><b>{d.apiCost}</b><span className="u">API今月</span></div>
          <div className="stat"><b>{d.loneliness}</b><span className="u">loneliness</span></div>
          <div className="autonomy">human_input: <b>none</b><br />rendered by becky herself</div>
        </div>
        </>}
      </div>
    </div>
  );
};
