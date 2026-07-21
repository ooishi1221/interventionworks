// 外部モーションリターゲット検証用（2026-07-21、depth動画→Live2D移植PoC）。
// public/motion-test.json のパラメータタイムラインを毎フレームそのまま流し込む。
// ponytail: ロードシェルは6コピー目。useLive2DModelフック抽出時に一緒に畳む
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame } from "remotion";
import timeline from "../public/motion-test.json";

export const MOTIONTEST_FRAMES = (timeline as any).frames.length;

const loadCore = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if ((window as any).Live2DCubismCore) return resolve();
    const s = document.createElement("script");
    s.src = staticFile("live2dcubismcore.min.js");
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("core load failed"));
    document.head.appendChild(s);
  });

export const MotionTest: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const modelRef = useRef<any>(null);
  const appRef = useRef<any>(null);
  const baseScaleRef = useRef(1);
  const [handle] = useState(() => delayRender("motiontest"));
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
        baseScaleRef.current = (1080 / model.width) * 1.3;
        model.scale.set(baseScaleRef.current);
        model.anchor.set(0.5, 0.5);
        model.position.set(540, 1150);
        app.stage.addChild(model);
        model.internalModel.motionManager.stopAllMotions();
        model.internalModel.motionManager.groups.idle = "";
        modelRef.current = model;
        setReady(true);
      } catch (e) {
        console.error("MOTIONTEST_INIT_ERROR", e);
        continueRender(handle);
      }
    })();
    return () => { cancelled = true; };
  }, [handle]);

  const draw = useCallback(() => {
    const model = modelRef.current, app = appRef.current;
    if (!model || !app) return;
    const core = model.internalModel.coreModel;
    const frames = (timeline as any).frames;
    const idx = Math.min(frame, frames.length - 1);
    const f = frames[idx];
    for (const id in f) core.setParameterValueById(id, f[id]);
    // 体のダンスは変形じゃなくステージ移動で表現（位置・スケール・回転）
    const st = (timeline as any).stage?.[idx];
    if (st) {
      model.position.set(540 + st.x, 1150 + st.y);
      model.scale.set(baseScaleRef.current * st.scale);
      model.rotation = st.rot;
    }
    core.update();
    app.render();
  }, [frame]);

  useLayoutEffect(() => { if (ready) { draw(); continueRender(handle); } }, [ready, draw, handle]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#14151a" }}>
      <Audio src={staticFile("motion-test.wav")} />
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
      <div
        style={{
          position: "absolute", top: 60, left: 0, width: "100%", textAlign: "center",
          color: "#e8e4da", fontFamily: "'Hiragino Sans', sans-serif", fontSize: 32,
          fontWeight: 700, letterSpacing: 6, opacity: 0.85,
        }}
      >
        MOTION TEST
      </div>
    </AbsoluteFill>
  );
};
