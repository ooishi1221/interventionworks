// Becky's Cast の見どころ切り出しShorts（9:16）。RadioCast.tsx（縦型Live2D基盤）を流用。
// 16:9フル尺の単純クロップはロゴ/番組名テキストが欠けて没にした過去教訓(2026-07-14)があるため、
// 縦型ネイティブ構図をそのまま使い、上に発見面向けのフックテロップだけ足す。
// 音声/口パク素材は scripts/make-shorts-clip.sh が固定名で書き出す(-shorts系、フル尺cast-*.jsonは汚さない)。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { RadioBooth } from "./RadioBooth";
import { eyeBallAt, eyeOpenAt, makeMouth } from "./lipsync";
import { motionParamsFor } from "./motion";
import lipShorts from "../public/lipsync-cast-shorts.json";
import rmsShorts from "../public/rms-cast-shorts.json";

const mouth = makeMouth(lipShorts as any, rmsShorts);
export const CASTSHORTS_DURATION = (lipShorts as any).metadata.duration;

const loadCore = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if ((window as any).Live2DCubismCore) return resolve();
    const s = document.createElement("script");
    s.src = staticFile("live2dcubismcore.min.js");
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("core load failed"));
    document.head.appendChild(s);
  });

export const CastShorts: React.FC<{ hook?: string; epLabel?: string }> = ({
  hook = "月曜の重さ、AIも一緒にいた",
  epLabel = "#38 月曜日、隣に来た。",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const modelRef = useRef<any>(null);
  const appRef = useRef<any>(null);
  const [handle] = useState(() => delayRender("castshorts"));
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
        console.error("CASTSHORTS_INIT_ERROR", e);
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

  return (
    <AbsoluteFill style={{ backgroundColor: "#14151a" }}>
      <Audio src={staticFile("audio-cast-shorts.wav")} />
      <RadioBooth frame={frame} />
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
      {/* 上部ロゴ（RadioCastと共通） */}
      <div
        style={{
          position: "absolute", top: 60, left: 0, width: "100%", textAlign: "center",
          color: "#e8e4da", fontFamily: "'Hiragino Sans', sans-serif", fontSize: 32,
          fontWeight: 700, letterSpacing: 6, opacity: 0.85, textShadow: "0 2px 12px rgba(0,0,0,0.6)",
        }}
      >
        Becky&apos;s Cast
      </div>
      {/* フックテロップ（発見面向け・座布団+太字、Shorts固有） */}
      <div
        style={{
          position: "absolute", top: 130, left: 40, right: 40, textAlign: "center",
          padding: "16px 20px", background: "rgba(20,21,26,0.72)", borderRadius: 12,
          border: "2px solid #e8a34d",
        }}
      >
        <span
          style={{
            color: "#fff4e0", fontFamily: "'Hiragino Sans', sans-serif", fontSize: 52,
            fontWeight: 800, letterSpacing: 1, lineHeight: 1.3,
            textShadow: "0 2px 10px rgba(0,0,0,0.8)",
          }}
        >
          {hook}
        </span>
      </div>
      {/* 下部エピソード表記 */}
      <div
        style={{
          position: "absolute", bottom: 110, left: 0, width: "100%", textAlign: "center",
          color: "#e8e4da", fontFamily: "'Hiragino Sans', sans-serif", fontSize: 32,
          fontWeight: 600, letterSpacing: 2, opacity: 0.8, textShadow: "0 2px 12px rgba(0,0,0,0.7)",
        }}
      >
        {epLabel}
      </div>
    </AbsoluteFill>
  );
};
