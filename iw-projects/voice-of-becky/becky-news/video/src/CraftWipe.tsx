// CraftWipe — BECKY CRAFT のワイプ（右下バストアップ）用 Live2D レイヤー（480x520、背景透過）。
// becky-craft の episode_audio.json（public/craft-events.json にコピーされる）駆動:
//   セリフ中 = 簡易口パク（正弦開閉）/ 表情 = voice.volume からの写像（声のトンマナ→顔）
// ProRes 4444 alpha でレンダして ffmpeg overlay で収録映像に重ねる。
// ponytail: 口パクは簡易版。Rhubarb 化する時は mouthAt を差し替えるだけ。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { eyeBallAt, eyeOpenAt } from "./lipsync";
import { motionParamsFor } from "./motion";
import events from "../public/craft-events.json";

type Ev = { t: number; dur: number; vol?: number };
const EVENTS = events as Ev[];
export const CRAFT_WIPE_DURATION = EVENTS.length
  ? EVENTS[EVENTS.length - 1].t + EVENTS[EVENTS.length - 1].dur + 2
  : 10;

const W = 480, H = 520;
const MODEL_SCALE = 1.35;  // バストアップ（顔〜胸あたり）
const MODEL_X = 240, MODEL_Y = 430;

// 現在（または直近 0.8s 以内に終わった）セリフ
const eventAt = (t: number): Ev | undefined =>
  EVENTS.find((e) => t >= e.t && t <= e.t + e.dur + 0.8);

// 表情の素材値: 0.4s 窓の平均 vol（フレーム毎に決定的）
const volAt = (t: number): number => {
  let sum = 0;
  for (let i = 0; i < 5; i++) {
    const e = eventAt(t - i * 0.1);
    sum += e?.vol ?? 1.0;
  }
  return sum / 5;
};

// 簡易口パク: セリフ中は 3.2Hz の開閉 × ゆらぎ。絶叫はより大きく開く
const mouthAt = (t: number): number => {
  const e = EVENTS.find((ev) => t >= ev.t && t <= ev.t + ev.dur);
  if (!e) return 0;
  const base = 0.28 + ((e.vol ?? 1.0) >= 1.6 ? 0.22 : 0);
  const wob = Math.abs(Math.sin(2 * Math.PI * 3.2 * t)) * (0.72 + 0.28 * Math.sin(2 * Math.PI * 0.9 * t + 1.3));
  return Math.min(1, base + 0.5 * wob);
};

const loadCore = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if ((window as any).Live2DCubismCore) return resolve();
    const s = document.createElement("script");
    s.src = staticFile("live2dcubismcore.min.js");
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("core load failed"));
    document.head.appendChild(s);
  });

export const CraftWipe: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const modelRef = useRef<any>(null);
  const appRef = useRef<any>(null);
  const [handle] = useState(() => delayRender("craftwipe"));
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
        const app = new PIXI.Application({ view: canvasRef.current!, width: W, height: H, backgroundAlpha: 0, autoStart: false, antialias: true });
        appRef.current = app;
        const model = await Live2DModel.from(staticFile("model/Becky_Live2D_Model.model3.json"), { autoInteract: false });
        if (cancelled) return;
        model.scale.set((H / model.width) * MODEL_SCALE);
        model.anchor.set(0.5, 0.5);
        model.position.set(MODEL_X, MODEL_Y);
        app.stage.addChild(model);
        model.internalModel.motionManager.stopAllMotions();
        model.internalModel.motionManager.groups.idle = "";
        modelRef.current = model;
        setReady(true);
      } catch (e) {
        console.error("CRAFTWIPE_INIT_ERROR", e);
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
    // モーション: idle のみ（ojigi なし・wave なし）
    const m = motionParamsFor(frame, fps, 0, Infinity);
    for (const id in m) core.setParameterValueById(id, m[id]);
    core.setParameterValueById("ParamMouthOpenY", mouthAt(t));

    // 声のトンマナ → 顔（絶叫=驚き顔 / うれしい=笑顔 / しんみり・ひそひそ=伏し目）
    const v = volAt(t);
    const odoroki = Math.min(1, Math.max(0, (v - 1.5) / 0.45)) * 0.8;
    const egaoN = v >= 1.1 && v < 1.55 ? Math.min(1, (v - 1.1) / 0.3) * 0.75 : 0;
    const lowEye = v <= 0.85 ? Math.min(1, (0.85 - v) / 0.35) : 0;  // しんみりの伏し目

    // 半目根絶の非線形（Zatsudan000 の学びそのまま）
    const s = Math.min(1, Math.max(0, (egaoN - 0.5) / 0.35));
    const eyeSmileN = s * s * (3 - 2 * s);
    const eye = eyeOpenAt(frame) * (1 - eyeSmileN) * (1 - 0.45 * lowEye);
    core.setParameterValueById("ParamEyeLOpen", eye);
    core.setParameterValueById("ParamEyeROpen", eye);
    core.setParameterValueById("ParamEyeLSmile", eyeSmileN);
    core.setParameterValueById("ParamEyeRSmile", eyeSmileN);
    const e = eyeBallAt(frame, fps);
    core.setParameterValueById("ParamEyeBallX", e.x);
    core.setParameterValueById("ParamEyeBallY", e.y);
    core.setParameterValueById("egao", egaoN * 0.8);
    core.setParameterValueById("odorokigao", odoroki);
    core.setParameterValueById("teregao", 0);
    core.setParameterValueById("doyagao", 0);
    // 絶叫時は体も揺らす
    if (odoroki > 0.3) {
      core.setParameterValueById("ParamBodyAngleX", Math.sin(2 * Math.PI * 5 * t) * 4 * odoroki);
    }
    core.update();
    app.render();
  }, [frame, fps]);

  useLayoutEffect(() => { if (ready) { draw(); continueRender(handle); } }, [ready, draw, handle]);

  return <canvas ref={canvasRef} width={W} height={H} style={{ width: W, height: H }} />;
};
