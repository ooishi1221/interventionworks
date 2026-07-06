import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AbsoluteFill, Audio, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import { BeckyUI } from "./BeckyUI";
import { Opener } from "./Opener";
import { eyeBallAt, eyeOpenAt, makeMouth } from "./lipsync";
import { motionParamsFor } from "./motion";
import boundaries from "../public/boundaries-008.json";
import lip008 from "../public/lipsync-008.json";
import rms008 from "../public/rms-008.json";

const mouth = makeMouth(lip008 as any, rms008);
const OPEN_END = boundaries.opener[1];
const [OPENING_S, OPENING_E] = boundaries.opening;
const [BODY_S, BODY_E] = boundaries.body;
const [END_S] = boundaries.ending;
const D1 = OPENING_E - OPENING_S;              // 挨拶の尺（相対 ojigiEnd）
const WAVE_REL = END_S - OPENING_S;            // 手振り開始（挨拶起点の相対時刻）

// ponytail: Live2D ロードシェルは4コピー目。5本目の pilot が出たら useLive2DModel フックに抽出。
const loadCore = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if ((window as any).Live2DCubismCore) return resolve();
    const s = document.createElement("script");
    s.src = staticFile("live2dcubismcore.min.js");
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("core load failed"));
    document.head.appendChild(s);
  });

const expressionAt = (t: number) => {
  const XF = 0.5;
  const kom = t < BODY_S ? 0 : t < BODY_S + XF ? (t - BODY_S) / XF : t < END_S ? 1 : t < END_S + XF ? 1 - (t - END_S) / XF : 0;
  const ega = t < END_S ? 0 : t < END_S + XF ? (t - END_S) / XF : 1;
  return { komarigao: kom * 0.4, egao: ega * 0.8 };
};

export const Pilot008: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const modelRef = useRef<any>(null);
  const appRef = useRef<any>(null);
  const [handle] = useState(() => delayRender("p008"));
  const [ready, setReady] = useState(false);
  const openerFrames = Math.round(OPEN_END * fps);

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
        console.error("P008_INIT_ERROR", e);
        continueRender(handle);
      }
    })();
    return () => { cancelled = true; };
  }, [handle]);

  const draw = useCallback(() => {
    const model = modelRef.current, app = appRef.current;
    if (!model || !app) return;
    const core = model.internalModel.coreModel;
    // モーションはオープナー分オフセット（挨拶開始で t=0 になり、お辞儀が挨拶に同期）
    const m = motionParamsFor(frame - openerFrames, fps, D1, WAVE_REL);
    for (const id in m) core.setParameterValueById(id, m[id]);
    core.setParameterValueById("ParamMouthOpenY", mouth.rmsEasedAt(frame));
    core.setParameterValueById("ParamMouthForm", mouth.mouthFormAt(frame, fps));
    const eye = eyeOpenAt(frame);
    core.setParameterValueById("ParamEyeLOpen", eye);
    core.setParameterValueById("ParamEyeROpen", eye);
    const e = eyeBallAt(frame, fps);
    core.setParameterValueById("ParamEyeBallX", e.x);
    core.setParameterValueById("ParamEyeBallY", e.y);
    const ex = expressionAt(frame / fps);
    core.setParameterValueById("komarigao", ex.komarigao);
    core.setParameterValueById("egao", ex.egao);
    core.update();
    app.render();
  }, [frame, fps, openerFrames]);

  useLayoutEffect(() => { if (ready) { draw(); continueRender(handle); } }, [ready, draw, handle]);

  const t = frame / fps;
  const showTopic = t >= BODY_S && t < BODY_E;
  const openerOpacity = interpolate(frame, [openerFrames - 8, openerFrames + 2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0d0d14" }}>
      <Audio src={staticFile("audio-008.wav")} />
      <BeckyUI frame={frame} layer="back" />
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
      <BeckyUI frame={frame} layer="front" showTopic={showTopic} />
      {frame < openerFrames + 2 && <div style={{ position: "absolute", inset: 0, opacity: openerOpacity }}><Opener /></div>}
    </AbsoluteFill>
  );
};
