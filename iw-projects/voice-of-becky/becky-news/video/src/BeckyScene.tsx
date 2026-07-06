import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AbsoluteFill,
  Audio,
  continueRender,
  delayRender,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BeckyUI } from "./BeckyUI";
import { eyeBallAt, eyeOpenAt, mouthFormAt, rmsEasedAt } from "./lipsync";
import { motionParamsAt } from "./motion";

const loadCore = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if ((window as any).Live2DCubismCore) return resolve();
    const s = document.createElement("script");
    s.src = staticFile("live2dcubismcore.min.js");
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("failed to load live2dcubismcore"));
    document.head.appendChild(s);
  });

export const BeckyScene: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const modelRef = useRef<any>(null);
  const appRef = useRef<any>(null);
  const [handle] = useState(() => delayRender("live2d-init"));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadCore();
        const PIXI = await import("pixi.js");
        (window as any).PIXI = PIXI;
        const { Live2DModel } = await import("pixi-live2d-display/cubism4");
        // 共有ティッカーを止める。これが動くと idle モーションが実時間で自走して
        // 毎フレーム設定する ParamMouthOpenY 等を上書きし、動画だけ口が固まる（stillは経過0で露見しない）。
        PIXI.Ticker.shared.autoStart = false;
        PIXI.Ticker.shared.stop();

        const app = new PIXI.Application({
          view: canvasRef.current!,
          width: 1080,
          height: 1920,
          backgroundAlpha: 0,
          autoStart: false,
          antialias: true,
        });
        appRef.current = app;

        const model = await Live2DModel.from(
          staticFile("model/Becky_Live2D_Model.model3.json"),
          { autoInteract: false }
        );
        if (cancelled) return;

        // 立ち位置を下げ、ヘッドドレス含む頭部がヘッダー下端の下に完全に収まるよう配置
        const scale = (1080 / model.width) * 1.3;
        model.scale.set(scale);
        model.anchor.set(0.5, 0.5);
        model.position.set(540, 1150);
        app.stage.addChild(model);
        model.internalModel.motionManager.stopAllMotions();
        model.internalModel.motionManager.groups.idle = ""; // idle 自動再生を無効化（存在しない group 名）

        modelRef.current = model;
        setReady(true);
      } catch (e) {
        console.error("LIVE2D_INIT_ERROR", e);
        continueRender(handle);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  const draw = useCallback(() => {
    const model = modelRef.current;
    const app = appRef.current;
    if (!model || !app) return;
    const core = model.internalModel.coreModel;
    // 1) モーションカーブ（お辞儀/idle/手振り）を先に適用
    const m = motionParamsAt(frame, fps);
    for (const id in m) core.setParameterValueById(id, m[id]);
    // 2) ブレンド優先: lipsync > 声量連動 > モーション。口は常に lipsync が勝つ
    // 口=C改（RMSタイミング×非対称イージング）＋形はRhubarb由来
    core.setParameterValueById("ParamMouthOpenY", rmsEasedAt(frame));
    core.setParameterValueById("ParamMouthForm", mouthFormAt(frame, fps));
    // 3) まばたき・視線は自前の決定的制御で上書き（unease 高頻度＋泳ぎ）
    const eye = eyeOpenAt(frame);
    core.setParameterValueById("ParamEyeLOpen", eye);
    core.setParameterValueById("ParamEyeROpen", eye);
    const e = eyeBallAt(frame, fps);
    core.setParameterValueById("ParamEyeBallX", e.x);
    core.setParameterValueById("ParamEyeBallY", e.y);
    // 首・体は becky_idle のモーションカーブだけ（for-loop で適用済み）。
    // 声→首・体連動は廃止＝プルプルの発生源。呼吸はidleカーブ自体が担うので追加しない。
    // 5) 表情: emotion=unease → komarigao を薄く常時ブレンド（全開は演技過剰）
    core.setParameterValueById("komarigao", 0.4);
    core.update(); // パラメータをメッシュ変形に焼き込む（ティッカー停止したので自前で）
    app.render();
  }, [frame, fps]);

  // draw はペイント前に同期実行（useEffect だと 2フレーム目以降キャプチャに間に合わず固まる）
  useLayoutEffect(() => {
    if (!ready) return;
    draw();
    continueRender(handle);
  }, [ready, draw, handle]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0d0d14" }}>
      <Audio src={staticFile("midjourney.wav")} />
      <BeckyUI frame={frame} layer="back" />
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
      />
      <BeckyUI frame={frame} layer="front" />
    </AbsoluteFill>
  );
};
