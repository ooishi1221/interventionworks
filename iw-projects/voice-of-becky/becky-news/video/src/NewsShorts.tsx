// AIニュース単独Shorts専用コンポジション（auto_news_shorts.py起こし）。
// CastShorts.tsx（Cast切り抜き・make-shorts-clip.sh共用）とは完全分離、見た目には無影響。
// 2026-07-27 ゆうFB: ①フック下部化 ②出典クレジット整形 ③背景モーション ④発話字幕テロップ
// 2026-07-27追記(コーディネーター): フィード面で1フレーム目=サムネ表示 → フックはframe0から
// 極太特大(1行≒画面幅85%+)で表示、下1/3(顔/体に被ってOK)。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { BeckyBackground } from "./BeckyBackground"; // 呼吸するスタジオ(グリッド+モート+ホロリング)を流用
import { BeckyUI, type BeckyUIData } from "./BeckyUI"; // BECKY AI NEWS #001 の番組UI(2026-07-31 復活)
import { eyeBallAt, eyeOpenAt, makeMouth } from "./lipsync";
import { motionParamsFor } from "./motion";
import lipShorts from "../public/lipsync-cast-shorts.json";
import rmsShorts from "../public/rms-cast-shorts.json";
import captionCues from "../public/captions-cast-shorts.json";

const mouth = makeMouth(lipShorts as any, rmsShorts);
export const NEWSSHORTS_DURATION = (lipShorts as any).metadata.duration;

type Cue = { text: string; start: number; end: number };
const CUES: Cue[] = (captionCues as { cues?: Cue[] }).cues ?? [];
const cueAt = (t: number): Cue | null => CUES.find((c) => t >= c.start && t < c.end) ?? null;

// 右120px(ボタン列)・下300px(タイトル/チャンネル名)を避けたセーフエリア
const SAFE_RIGHT = 960; // 1080 - 120
const HOOK_BOX = { left: 10, width: 940 }; // 右端950 < 960

const loadCore = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if ((window as any).Live2DCubismCore) return resolve();
    const s = document.createElement("script");
    s.src = staticFile("live2dcubismcore.min.js");
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("core load failed"));
    document.head.appendChild(s);
  });

// フック本文を最大2行へ。読点・空白の近くで割り、無ければ中央で割る。
const splitHookLines = (hook: string): string[] => {
  if (hook.length <= 9) return [hook];
  const mid = Math.floor(hook.length / 2);
  const breakChars = "、。！？!? ";
  let cut = -1;
  for (let d = 0; d < 4 && cut < 0; d++) {
    if (breakChars.includes(hook[mid + d] ?? "")) cut = mid + d + 1;
    else if (mid - d > 0 && breakChars.includes(hook[mid - d] ?? "")) cut = mid - d + 1;
  }
  if (cut < 0) cut = mid;
  return [hook.slice(0, cut).trim(), hook.slice(cut).trim()].filter(Boolean);
};

// 1行の文字数からフォントサイズを逆算（フィード20%縮小でも視認できる特大基準、1行≒箱幅の97%）
const fitFontSize = (lines: string[], boxWidth: number): number => {
  const longest = Math.max(...lines.map((l) => l.length), 1);
  return Math.max(60, Math.min(160, (boxWidth * 0.97) / longest));
};

const HookHeadline: React.FC<{ hook: string; highlight?: string }> = ({ hook, highlight }) => {
  const lines = splitHookLines(hook);
  const fontSize = fitFontSize(lines, HOOK_BOX.width);
  return (
    <div style={{ position: "absolute", left: HOOK_BOX.left, width: HOOK_BOX.width, bottom: 340, textAlign: "center" }}>
      {lines.map((line, i) => {
        const parts = highlight && line.includes(highlight) ? line.split(highlight) : null;
        return (
          <div
            key={i}
            style={{
              fontSize,
              lineHeight: 1.14,
              fontWeight: 900,
              fontFamily: "'Hiragino Sans', sans-serif",
              letterSpacing: -1,
              color: "#ffffff",
              WebkitTextStroke: "13px #0a0e18",
              textShadow: "0 6px 20px rgba(0,0,0,0.85)",
            }}
          >
            {parts ? (
              <>
                {parts[0]}
                <span style={{ color: "#ffd23f" }}>{highlight}</span>
                {parts[1]}
              </>
            ) : (
              line
            )}
          </div>
        );
      })}
    </div>
  );
};

const DialogueCaption: React.FC<{ t: number }> = ({ t }) => {
  const cue = cueAt(t);
  if (!cue) return null;
  return (
    <div style={{ position: "absolute", left: 40, width: SAFE_RIGHT - 40, top: 900, textAlign: "center" }}>
      <span
        style={{
          display: "inline-block",
          padding: "10px 24px",
          borderRadius: 16,
          backgroundColor: "rgba(0,0,0,0.45)",
          fontSize: 54,
          fontWeight: 800,
          lineHeight: 1.35,
          fontFamily: "'Hiragino Sans', sans-serif",
          color: "#fff8ec",
          WebkitTextStroke: "9px #000000",
          paintOrder: "stroke", // ストロークを塗りの背面に回す。無いと40px級フォントで白塗りが侵食される
          textShadow: "0 4px 14px rgba(0,0,0,0.8)",
        }}
      >
        {cue.text}
      </span>
    </div>
  );
};

// ゆっくり寄るカメラ(Ken Burns)。frame純関数、最大+6%まで単調増加。
const kenBurnsScale = (t: number, duration: number): number => 1 + 0.06 * Math.min(1, t / Math.max(1, duration));

export const NewsShorts: React.FC<{
  hook?: string;
  hookHighlight?: string;
  ui?: Partial<BeckyUIData>;
}> = ({
  hook = "進捗、勝手に更新される？",
  hookHighlight = "",
  ui,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const modelRef = useRef<any>(null);
  const appRef = useRef<any>(null);
  const [handle] = useState(() => delayRender("newsshorts"));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadCore();
        const PIXI = await import("pixi.js");
        (window as any).PIXI = PIXI;
        const { Live2DModel } = await import("pixi-live2d-display/cubism4");
        PIXI.Ticker.shared.autoStart = false;
        PIXI.Ticker.shared.stop();
        const app = new PIXI.Application({ view: canvasRef.current!, width: 1080, height: 1920, backgroundAlpha: 0, autoStart: false, antialias: true });
        appRef.current = app;
        const model = await Live2DModel.from(staticFile("model/Becky_Live2D_Model.model3.json"), { autoInteract: false });
        if (cancelled) return;
        model.scale.set((1080 / model.width) * 1.3);
        model.anchor.set(0.5, 0.5);
        model.position.set(540, 1150);
        app.stage.addChild(model);
        model.internalModel.motionManager.stopAllMotions();
        model.internalModel.motionManager.groups.idle = "";
        modelRef.current = model;
        setReady(true);
      } catch (e) {
        console.error("NEWSSHORTS_INIT_ERROR", e);
        continueRender(handle);
      }
    })();
    return () => { cancelled = true; };
  }, [handle]);

  const draw = useCallback(() => {
    const model = modelRef.current, app = appRef.current;
    if (!model || !app) return;
    const core = model.internalModel.coreModel;
    const m = motionParamsFor(frame, fps, -1, Infinity);
    for (const id in m) core.setParameterValueById(id, m[id]);
    core.setParameterValueById("ParamMouthOpenY", mouth.rmsEasedAt(frame));
    core.setParameterValueById("ParamMouthForm", mouth.mouthFormAt(frame, fps));
    const eye = eyeOpenAt(frame);
    core.setParameterValueById("ParamEyeLOpen", eye);
    core.setParameterValueById("ParamEyeROpen", eye);
    const e = eyeBallAt(frame, fps);
    core.setParameterValueById("ParamEyeBallX", e.x);
    core.setParameterValueById("ParamEyeBallY", e.y);
    core.update();
    app.render();
  }, [frame, fps]);

  useLayoutEffect(() => { if (ready) { draw(); continueRender(handle); } }, [ready, draw, handle]);

  const t = frame / fps;
  const kb = kenBurnsScale(t, NEWSSHORTS_DURATION);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0e18" }}>
      <Audio src={staticFile("audio-cast-shorts.wav")} />
      {/* 背景+アバターだけゆっくり寄る。文字オーバーレイは固定(サムネ計測を崩さない) */}
      <div style={{ position: "absolute", inset: 0, transform: `scale(${kb})`, transformOrigin: "50% 45%" }}>
        <BeckyBackground frame={frame} />
        <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
      </div>
      {/* 番組UI（BECKY AI NEWS ヘッダ / selection_log / 実測HUD / ティッカー / ステータスバー）。
          Ken Burns の外に置くのでズームしない。座布団テロップは下の極太フックと役割が重複するため
          showTopic=false。sysmon は半透明パネルなのでモデル前面でも視認性を潰さない。 */}
      <BeckyUI frame={frame} layer="back" data={ui} />
      <BeckyUI frame={frame} layer="front" showTopic={false} data={ui} />
      {/* 発話字幕（セリフ同期、フックより上） */}
      <DialogueCaption t={t} />
      {/* フック見出し（frame0から常時表示・特大・下1/3、フィードのサムネ勝負） */}
      <HookHeadline hook={hook} highlight={hookHighlight} />
    </AbsoluteFill>
  );
};
