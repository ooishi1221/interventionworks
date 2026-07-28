// 透過立ち絵素材パック（サムネ合成用、becky-craft/scripts/record-episode.py make_thumbnail() の
// becky_png 差し込み口向け）。動画は作らない、1フレームだけ static に描いて `remotion still` で
// 透過PNGに焼く。表情は prop で切替（Root.tsx が表情ごとに Composition を1個ずつ持つ）。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame } from "remotion";
import { eyeBallAt, eyeOpenAt } from "./lipsync";
import { motionParamsFor } from "./motion";

export type PortraitExpression = "idle" | "egao" | "komarigao";

// ponytail: Live2D ロードシェルは7コピー目。次の pilot で useLive2DModel フックに抽出する。
const loadCore = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if ((window as any).Live2DCubismCore) return resolve();
    const s = document.createElement("script");
    s.src = staticFile("live2dcubismcore.min.js");
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("core load failed"));
    document.head.appendChild(s);
  });

export const Portrait: React.FC<{ expression: PortraitExpression }> = ({ expression }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const modelRef = useRef<any>(null);
  const appRef = useRef<any>(null);
  const [handle] = useState(() => delayRender("portrait"));
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
        const app = new PIXI.Application({ view: canvasRef.current!, width: 1080, height: 1080, backgroundAlpha: 0, autoStart: false, antialias: true });
        appRef.current = app;
        const model = await Live2DModel.from(staticFile("model/Becky_Live2D_Model.model3.json"), { autoInteract: false });
        if (cancelled) return;
        // 既存コンポジション共通の全身スケール/位置をそのまま流用。
        // canvas を 1920→1080 に縮めるだけで上半身(顔〜胸)だけが自然にフレームへ残る
        // （scale/position をいじって寄せようとすると顔が切れる、実測で確認済み）
        model.scale.set((1080 / model.width) * 1.3);
        model.anchor.set(0.5, 0.5);
        model.position.set(540, 1150);
        app.stage.addChild(model);
        model.internalModel.motionManager.stopAllMotions();
        model.internalModel.motionManager.groups.idle = "";
        modelRef.current = model;
        setReady(true);
      } catch (e) {
        console.error("PORTRAIT_INIT_ERROR", e);
        continueRender(handle);
      }
    })();
    return () => { cancelled = true; };
  }, [handle]);

  const draw = useCallback(() => {
    const model = modelRef.current, app = appRef.current;
    if (!model || !app) return;
    const core = model.internalModel.coreModel;
    // 静止画なので体は idle ループの1点（frame=0）だけサンプル。ojigi/wave は使わない。
    const m = motionParamsFor(0, 30, -1, Infinity);
    for (const id in m) core.setParameterValueById(id, m[id]);
    core.setParameterValueById("ParamMouthOpenY", 0);
    core.setParameterValueById("ParamMouthForm", 0);
    // frame=0 はまばたき周期(66f)の非閉眼区間 → 目を開いた状態で確定的に止まる
    const eye = eyeOpenAt(0);
    core.setParameterValueById("ParamEyeLOpen", expression === "egao" ? eye * 0 : eye);
    core.setParameterValueById("ParamEyeROpen", expression === "egao" ? eye * 0 : eye);
    const e = eyeBallAt(0, 30); // t=0 → 正面向き
    core.setParameterValueById("ParamEyeBallX", e.x);
    core.setParameterValueById("ParamEyeBallY", e.y);
    // egao は目を EyeSmile（笑い弧）に切替える必要あり（Pilot008 の既知の罠: 単純合成だと半目になる）
    core.setParameterValueById("ParamEyeLSmile", expression === "egao" ? 1 : 0);
    core.setParameterValueById("ParamEyeRSmile", expression === "egao" ? 1 : 0);
    core.setParameterValueById("egao", expression === "egao" ? 1 : 0);
    core.setParameterValueById("komarigao", expression === "komarigao" ? 1 : 0);
    core.update();
    app.render();
  }, [expression]);

  useLayoutEffect(() => { if (ready) { draw(); continueRender(handle); } }, [ready, draw, handle, frame]);

  // 背景を敷かない（transparent）。AbsoluteFill に backgroundColor を指定すると透過PNGが壊れるので注意
  return (
    <AbsoluteFill>
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
    </AbsoluteFill>
  );
};
