// 「ベキたん家から雑談 #000」（1920x1080）— 自宅フレーム（JitakuFrame）× Live2D。
// タイムラインは boundaries-zatsudan001.json のブロック境界駆動（台本 daihon.md の演出指示通り）。
// A: ojigi+jingle / B: お題帯強調 / C: pop+テレビimg1+doyagao / D: pop+img2+後半egao /
// E: dadan+odoroku+odorokigao→teregao / F: tewohuru+egaoフル+テレビoff
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { JitakuFrame, TvContent } from "./JitakuFrame";
import { eyeBallAt, eyeOpenAt, makeMouth } from "./lipsync";
import { motionParamsFor } from "./motion";
import boundaries from "../public/boundaries-zatsudan001.json";
import lipZ from "../public/lipsync-zatsudan001.json";
import rmsZ from "../public/rms-zatsudan001.json";

const mouth = makeMouth(lipZ as any, rmsZ);
export const ZATSUDAN001_DURATION = boundaries.total;

const B = boundaries.blocks as Record<string, number[]>;
const A_S = B.A[0], B_S = B.B[0], B_E = B.B[1], C_S = B.C[0], D_S = B.D[0], D_MID = (B.D[0] + B.D[1]) / 2, E_S = B.E[0], E_MID = (B.E[0] + B.E[1]) / 2, F_S = B.F[0];

// --- 構図ノブ（mock-jitaku の becky-layer: left 800 / width 940 → 中心 x=1270。腰下は机 DESK_H=300 に沈む） ---
const MODEL_SCALE = 0.92;
const MODEL_X = 1270;
const MODEL_Y = 900;

// --- 表情タイムライン: Pilot008 の expressionAt をブロック境界ベースのキーフレーム配列に一般化 ---
// keys = [発火時刻, 目標値][]（時刻昇順・間隔 > XF 前提）。各キーで XF 秒かけて目標値へクロスフェード。
const XF = 0.4;
const trackAt = (t: number, keys: [number, number][]): number => {
  let v = keys[0][1];
  for (const [kt, kv] of keys) {
    if (t <= kt) break;
    v = t >= kt + XF ? kv : v + (kv - v) * ((t - kt) / XF);
  }
  return v;
};

const EGAO_FULL = 0.8; // Pilot008 と同じ「フル」
const expressionAt = (t: number) => ({
  // A: お辞儀明けに薄く egao 0.3 → B で素に。D 後半 0.5。F でフル。
  egao: trackAt(t, [[0, 0], [A_S + 2.2, 0.3], [B_S, 0], [F_S, EGAO_FULL]]),
  doyagao: trackAt(t, [[0, 0], [C_S, 0.35], [D_S, 0]]),
  odorokigao: trackAt(t, [[0, 0]]),
  teregao: trackAt(t, [[0, 0], [D_S, 0.4], [D_MID, 0]]),
});

// テレビ窓: C から img1、D から img2、F で off。切替時に短いフラッシュ。
const tvContentAt = (t: number): TvContent => (t < C_S ? "off" : t < D_S ? "img1" : t < F_S ? "img2" : "off");
const TV_SWITCHES = [C_S, D_S, F_S];
const tvFlashAt = (t: number): number => {
  let f = 0;
  for (const ts of TV_SWITCHES) if (t >= ts && t < ts + 0.2) f = Math.max(f, 1 - (t - ts) / 0.2);
  return f;
};

// お題帯強調（Bブロック中、0.3s でランプ）
const emphasisAt = (t: number): number => {
  if (t < B_S || t >= B_E + 0.3) return 0;
  if (t < B_S + 0.3) return (t - B_S) / 0.3;
  if (t >= B_E) return 1 - (t - B_E) / 0.3;
  return 1;
};

// ponytail: Live2D ロードシェルはさらにコピー。次に手を入れる人が useLive2DModel フックに抽出する。
const loadCore = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if ((window as any).Live2DCubismCore) return resolve();
    const s = document.createElement("script");
    s.src = staticFile("live2dcubismcore.min.js");
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("core load failed"));
    document.head.appendChild(s);
  });

export const Zatsudan001: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const modelRef = useRef<any>(null);
  const appRef = useRef<any>(null);
  const [handle] = useState(() => delayRender("zatsudan001"));
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
        const app = new PIXI.Application({ view: canvasRef.current!, width: 1920, height: 1080, backgroundAlpha: 0, autoStart: false, antialias: true });
        appRef.current = app;
        const model = await Live2DModel.from(staticFile("model/Becky_Live2D_Model.model3.json"), { autoInteract: false });
        if (cancelled) return;
        model.scale.set((1080 / model.width) * MODEL_SCALE);
        model.anchor.set(0.5, 0.5);
        model.position.set(MODEL_X, MODEL_Y);
        app.stage.addChild(model);
        model.internalModel.motionManager.stopAllMotions();
        model.internalModel.motionManager.groups.idle = "";
        modelRef.current = model;
        setReady(true);
      } catch (e) {
        console.error("ZATSUDAN001_INIT_ERROR", e);
        continueRender(handle);
      }
    })();
    return () => { cancelled = true; };
  }, [handle]);

  const draw = useCallback(() => {
    const model = modelRef.current, app = appRef.current;
    if (!model || !app) return;
    const core = model.internalModel.coreModel;
    const t = frame / fps;
    // モーション: 冒頭 ojigi(2.0s) → idle。E で odoroku 1回。F から tewohuru。
    const m = motionParamsFor(frame, fps, 2.0, F_S, Infinity);
    for (const id in m) core.setParameterValueById(id, m[id]);
    core.setParameterValueById("ParamMouthOpenY", mouth.rmsEasedAt(frame));
    core.setParameterValueById("ParamMouthForm", mouth.mouthFormAt(frame, fps));
    const ex = expressionAt(t);
    // 笑顔の目 = EyeSmile（笑い弧）を立てつつ開き目を引っ込める（Pilot008 の学びそのまま。
    // EyeOpen を消すだけだと目閉じ、混ぜると半目になる）
    const egaoN = ex.egao / EGAO_FULL;
    // 弱い egao の持続が半目を作る（2026-07-07 ゆう発見の同型3件目）。
    // 目への寄与は閾値つき: egaoN<0.5 は目に効かせず口・頬だけ、0.5→0.85 で一気に笑い弧へ。
    const s = Math.min(1, Math.max(0, (egaoN - 0.5) / 0.35));
    const eyeSmileN = s * s * (3 - 2 * s);
    const eye = eyeOpenAt(frame) * (1 - eyeSmileN);
    core.setParameterValueById("ParamEyeLOpen", eye);
    core.setParameterValueById("ParamEyeROpen", eye);
    core.setParameterValueById("ParamEyeLSmile", eyeSmileN);
    core.setParameterValueById("ParamEyeRSmile", eyeSmileN);
    const e = eyeBallAt(frame, fps);
    core.setParameterValueById("ParamEyeBallX", e.x);
    core.setParameterValueById("ParamEyeBallY", e.y);
    core.setParameterValueById("egao", ex.egao);
    core.setParameterValueById("doyagao", ex.doyagao);
    core.setParameterValueById("odorokigao", ex.odorokigao);
    core.setParameterValueById("teregao", ex.teregao);
    core.update();
    app.render();
  }, [frame, fps]);

  useLayoutEffect(() => { if (ready) { draw(); continueRender(handle); } }, [ready, draw, handle]);

  const t = frame / fps;
  const sec = (s: number) => Math.round(s * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0d0b" }}>
      {/* 本編音声（連結済みフル尺） */}
      <Audio src={staticFile("audio-zatsudan001.wav")} />
      {/* SE は映像側から（音声トラックに焼き込まない = タイミング調整が効く） */}
      <Sequence from={0} durationInFrames={sec(1.0)}><Audio src={staticFile("se_jingle.wav")} volume={1.8} /></Sequence>
      <Sequence from={sec(C_S)} durationInFrames={sec(0.4)}><Audio src={staticFile("se_pop.wav")} volume={1.8} /></Sequence>
      <Sequence from={sec(D_S)} durationInFrames={sec(0.4)}><Audio src={staticFile("se_pop.wav")} volume={1.8} /></Sequence>
      <JitakuFrame frame={frame} layer="back" epNum="#001" />
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
      <JitakuFrame frame={frame} layer="front" tvContent={tvContentAt(t)} tvFlash={tvFlashAt(t)} topicEmphasis={emphasisAt(t)} topic="Fable 5 と過ごしてみて" epNum="#001" tvImg={{ img1: "z001-img1.png", img2: "z001-img2.png" }} />
    </AbsoluteFill>
  );
};
