import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import { BeckyUI } from "./BeckyUI";
import { eyeBallAt, eyeOpenAt, makeMouth } from "./lipsync";
import { motionParamsFor } from "./motion";
import boundaries from "../public/boundaries-007.json";
import lip007 from "../public/lipsync-007.json";
import rms007 from "../public/rms-007.json";

const mouth = makeMouth(lip007 as any, rms007);
const [OPEN_END] = [boundaries.opening[1]];
const [BODY_S, BODY_E] = boundaries.body;
const [END_S] = boundaries.ending;

// ponytail: Live2D ロードシェルは BeckyScene/MouthTest と同型（3コピー目）。shipされた両者を無傷に保つため別実装。
const loadCore = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if ((window as any).Live2DCubismCore) return resolve();
    const s = document.createElement("script");
    s.src = staticFile("live2dcubismcore.min.js");
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("core load failed"));
    document.head.appendChild(s);
  });

// 台本境界で表情を切替: body=komarigao薄がけ / ending=egao。境界で0.5sクロスフェード。
const expressionAt = (t: number) => {
  const XF = 0.5;
  const kom = t < BODY_S ? 0
    : t < BODY_S + XF ? (t - BODY_S) / XF
    : t < END_S ? 1
    : t < END_S + XF ? 1 - (t - END_S) / XF : 0;
  const ega = t < END_S ? 0 : t < END_S + XF ? (t - END_S) / XF : 1;
  return { komarigao: kom * 0.4, egao: ega * 0.8 };
};

export const Pilot007: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const modelRef = useRef<any>(null);
  const appRef = useRef<any>(null);
  const [handle] = useState(() => delayRender("p007"));
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
        console.error("P007_INIT_ERROR", e);
        continueRender(handle);
      }
    })();
    return () => { cancelled = true; };
  }, [handle]);

  const draw = useCallback(() => {
    const model = modelRef.current, app = appRef.current;
    if (!model || !app) return;
    const core = model.internalModel.coreModel;
    const m = motionParamsFor(frame, fps, OPEN_END, END_S); // opening=ojigi→body=idle→ending=手振り
    for (const id in m) core.setParameterValueById(id, m[id]);
    core.setParameterValueById("ParamMouthOpenY", mouth.rmsEasedAt(frame)); // 口=C改
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
  }, [frame, fps]);

  useLayoutEffect(() => { if (ready) { draw(); continueRender(handle); } }, [ready, draw, handle]);

  const t = frame / fps;
  const showTopic = t >= BODY_S && t < BODY_E; // 座布団テロップは body 区間だけ

  return (
    <AbsoluteFill style={{ backgroundColor: "#0d0d14" }}>
      <Audio src={staticFile("audio-007.wav")} />
      <BeckyUI frame={frame} layer="back" />
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
      <BeckyUI frame={frame} layer="front" showTopic={showTopic} />
    </AbsoluteFill>
  );
};
