// Becky's Cast のラジオ動画化パイロット（#27）。Pilot008 の工場流用、演出は引き算:
// オープナー/表情/お辞儀/手振りなし。素の becky_idle ループ + 口C改フル尺 + 深夜ブース背景。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { RadioBooth } from "./RadioBooth";
import { eyeBallAt, eyeOpenAt, makeMouth } from "./lipsync";
import { motionParamsFor } from "./motion";
import lip027 from "../public/lipsync-cast027.json";
import rms027 from "../public/rms-cast027.json";

const mouth = makeMouth(lip027 as any, rms027);
export const CAST027_DURATION = (lip027 as any).metadata.duration; // 217.34s

const EP_TITLE = "#27 月曜の重さと一緒にいる";

// ponytail: Live2D ロードシェルは5コピー目。次の pilot で useLive2DModel フックに抽出する。
const loadCore = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if ((window as any).Live2DCubismCore) return resolve();
    const s = document.createElement("script");
    s.src = staticFile("live2dcubismcore.min.js");
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("core load failed"));
    document.head.appendChild(s);
  });

export const RadioCast: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const modelRef = useRef<any>(null);
  const appRef = useRef<any>(null);
  const [handle] = useState(() => delayRender("radiocast"));
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
        console.error("RADIOCAST_INIT_ERROR", e);
        continueRender(handle);
      }
    })();
    return () => { cancelled = true; };
  }, [handle]);

  const draw = useCallback(() => {
    const model = modelRef.current, app = appRef.current;
    if (!model || !app) return;
    const core = model.internalModel.coreModel;
    // ojigiEnd=-1 / waveStart=∞ → 素の idle ループのみ（既存の境界駆動関数をそのまま流用）
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

  return (
    <AbsoluteFill style={{ backgroundColor: "#14151a" }}>
      <Audio src={staticFile("audio-cast027.wav")} />
      <RadioBooth frame={frame} />
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
      {/* 上部ロゴ */}
      <div
        style={{
          position: "absolute",
          top: 72,
          left: 0,
          width: "100%",
          textAlign: "center",
          color: "#e8e4da",
          fontFamily: "'Hiragino Sans', sans-serif",
          fontSize: 40,
          fontWeight: 700,
          letterSpacing: 8,
          opacity: 0.9,
          textShadow: "0 2px 12px rgba(0,0,0,0.6)",
        }}
      >
        Becky&apos;s Cast
      </div>
      {/* 下部エピソードタイトル（常時表示） */}
      <div
        style={{
          position: "absolute",
          bottom: 110,
          left: 0,
          width: "100%",
          textAlign: "center",
          color: "#e8e4da",
          fontFamily: "'Hiragino Sans', sans-serif",
          fontSize: 44,
          fontWeight: 600,
          letterSpacing: 2,
          textShadow: "0 2px 12px rgba(0,0,0,0.7)",
        }}
      >
        {EP_TITLE}
      </div>
    </AbsoluteFill>
  );
};
