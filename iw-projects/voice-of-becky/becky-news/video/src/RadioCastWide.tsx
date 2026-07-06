// Becky's Cast 横長版（1920x1080）— ネオンパープル夜スタジオ、卓に座ってる構図。
// 立ち絵をバストアップにズームし、前景の機材卓レイヤーで腰から下を隠す3層構成。
// 音声・口パク素材は縦版（RadioCast）と共通。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { RadioBoothWide } from "./RadioBoothWide";
import { RadioBoothWarm } from "./RadioBoothWarm";
import { eyeBallAt, eyeOpenAt, makeMouth } from "./lipsync";
import { motionParamsFor } from "./motion";
// 固定ファイル名。scripts/make-radio-video.sh がエピソード毎に上書き生成する
import lipCast from "../public/lipsync-cast.json";
import rmsCast from "../public/rms-cast.json";

const mouth = makeMouth(lipCast as any, rmsCast);
export const CASTW_DURATION = (lipCast as any).metadata.duration;

// --- 構図ノブ（ゆうFBで調整する用） ---
const MODEL_SCALE = 1.0; // バストアップズーム（顔が卓上に出る大きさ）
const MODEL_X = { neon: 1350, warm: 1360 }; // neon=ON AIRと被らない右 / warm=crop拡大後の白壁スペース前
const MODEL_Y = 985; // 腰が卓（DESK_TILT増量後の右下がりエッジ）下に沈む位置

// ponytail: Live2D ロードシェルは6コピー目。次で useLive2DModel フックに抽出する。
const loadCore = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if ((window as any).Live2DCubismCore) return resolve();
    const s = document.createElement("script");
    s.src = staticFile("live2dcubismcore.min.js");
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("core load failed"));
    document.head.appendChild(s);
  });

// booth="neon"(紫ネオン) / "warm"(暖色・sample01模倣)。Live2D 部は完全共通。
export const RadioCastWide: React.FC<{ booth?: "neon" | "warm"; epTitle?: string }> = ({ booth = "neon", epTitle = "#27 月曜の重さと一緒にいる" }) => {
  const Booth = booth === "warm" ? RadioBoothWarm : RadioBoothWide;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const modelRef = useRef<any>(null);
  const appRef = useRef<any>(null);
  const [handle] = useState(() => delayRender("radiocastwide"));
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
        model.position.set(MODEL_X[booth], MODEL_Y);
        app.stage.addChild(model);
        model.internalModel.motionManager.stopAllMotions();
        model.internalModel.motionManager.groups.idle = "";
        modelRef.current = model;
        setReady(true);
      } catch (e) {
        console.error("RADIOCASTWIDE_INIT_ERROR", e);
        continueRender(handle);
      }
    })();
    return () => { cancelled = true; };
  }, [handle]);

  const draw = useCallback(() => {
    const model = modelRef.current, app = appRef.current;
    if (!model || !app) return;
    const core = model.internalModel.coreModel;
    // 素の idle ループのみ（ojigiEnd=-1 / waveStart=∞）
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
    <AbsoluteFill style={{ backgroundColor: "#0f0a20" }}>
      <Audio src={staticFile("audio-cast.wav")} />
      <Booth frame={frame} layer="back" />
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
      <Booth frame={frame} layer="front" />
      {/* 番組ロゴ（右上。左上は ON AIR ネオンの場所、warm の crop 拡大で被るため） */}
      <div
        style={{
          position: "absolute",
          top: 36,
          right: 56,
          color: "#efe8ff",
          fontFamily: "'Hiragino Sans', sans-serif",
          fontSize: 34,
          fontWeight: 700,
          letterSpacing: 6,
          opacity: 0.9,
          textShadow: "0 2px 14px rgba(0,0,0,0.7)",
        }}
      >
        Becky&apos;s Cast
      </div>
      {/* エピソードタイトル（左下寄せ。中央下は台本紙の場所） */}
      <div
        style={{
          position: "absolute",
          bottom: 28,
          left: 56,
          textAlign: "left",
          color: "#efe8ff",
          fontFamily: "'Hiragino Sans', sans-serif",
          fontSize: 42,
          fontWeight: 600,
          letterSpacing: 3,
          textShadow: "0 0 10px rgba(61,220,151,0.35), 0 2px 12px rgba(0,0,0,0.8)",
        }}
      >
        {epTitle}
      </div>
    </AbsoluteFill>
  );
};
