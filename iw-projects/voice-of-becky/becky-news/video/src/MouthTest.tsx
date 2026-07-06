import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { eyeBallAt, eyeOpenAt, mouthFormAt, mouthOpenAt, rmsEasedAt, rmsMouthAt } from "./lipsync";

const loadCore = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if ((window as any).Live2DCubismCore) return resolve();
    const s = document.createElement("script");
    s.src = staticFile("live2dcubismcore.min.js");
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("core load failed"));
    document.head.appendChild(s);
  });

// A/B 口パク比較用の顔クローズアップ。UIなし・モデルと音声だけ。
export const MouthTest: React.FC<{ method: "A" | "B" | "C" }> = ({ method }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const modelRef = useRef<any>(null);
  const appRef = useRef<any>(null);
  const [handle] = useState(() => delayRender("mtest"));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadCore();
        const PIXI = await import("pixi.js");
        (window as any).PIXI = PIXI;
        const { Live2DModel } = await import("pixi-live2d-display/cubism4");
        PIXI.Ticker.shared.autoStart = false; // 共有ティッカー停止（idle自走で口が上書きされるのを防ぐ）
        PIXI.Ticker.shared.stop();
        const app = new PIXI.Application({ view: canvasRef.current!, width: 1080, height: 1080, backgroundAlpha: 1, backgroundColor: 0x0d0d14, autoStart: false });
        appRef.current = app;
        const model = await Live2DModel.from(staticFile("model/Becky_Live2D_Model.model3.json"), { autoInteract: false });
        if (cancelled) return;
        // 顔がフレームを占めるよう拡大＋口元が中央下に来るよう配置
        model.scale.set((1080 / model.width) * 2.8);
        model.anchor.set(0.5, 0.5);
        model.position.set(540, 1500);
        app.stage.addChild(model);
        model.internalModel.motionManager.stopAllMotions();
        model.internalModel.motionManager.groups.idle = ""; // idle 自動再生を無効化
        modelRef.current = model;
        setReady(true);
      } catch (e) {
        console.error("MTEST_INIT_ERROR", e);
        continueRender(handle);
      }
    })();
    return () => { cancelled = true; };
  }, [handle]);

  const draw = useCallback(() => {
    const model = modelRef.current, app = appRef.current;
    if (!model || !app) return;
    const core = model.internalModel.coreModel;
    const mouth = method === "A" ? mouthOpenAt(frame, fps) : method === "C" ? rmsEasedAt(frame) : rmsMouthAt(frame);
    core.setParameterValueById("ParamMouthOpenY", mouth);
    // 形は Rhubarb 由来。A/C が併用、B(RMS単独)は縦のみ
    if (method !== "B") core.setParameterValueById("ParamMouthForm", mouthFormAt(frame, fps));
    const eye = eyeOpenAt(frame);
    core.setParameterValueById("ParamEyeLOpen", eye);
    core.setParameterValueById("ParamEyeROpen", eye);
    const e = eyeBallAt(frame, fps);
    core.setParameterValueById("ParamEyeBallX", e.x);
    core.setParameterValueById("ParamEyeBallY", e.y);
    core.update(); // パラメータ値をメッシュ変形に焼き込む（ティッカー停止したので自前で）
    app.render();
  }, [frame, fps, method]);

  // draw はペイント前に同期実行（useEffect だと 2フレーム目以降キャプチャに間に合わず固まる）
  useLayoutEffect(() => { if (ready) { draw(); continueRender(handle); } }, [ready, draw, handle]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0d0d14" }}>
      <Audio src={staticFile("midjourney.wav")} />
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
    </AbsoluteFill>
  );
};
