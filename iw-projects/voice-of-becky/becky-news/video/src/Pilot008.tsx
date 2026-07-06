import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import { BeckyBackground } from "./BeckyBackground";
import { BeckyUI } from "./BeckyUI";
import { Opener } from "./Opener";
import { eyeBallAt, eyeOpenAt, makeMouth } from "./lipsync";
import { motionParamsFor } from "./motion";
import boundaries from "../public/boundaries-008.json";
import lip008 from "../public/lipsync-008.json";
import rms008 from "../public/rms-008.json";

const mouth = makeMouth(lip008 as any, rms008);
const OPEN_END = boundaries.opener[1];

// お辞儀が終わってから話し出す（ゆうFB）: オープナー以降の音声を DELAY_S 遅らせる。
// 映像尺も同じ分伸びる（Root.tsx が P008_DELAY_S を参照）。
const OJIGI_DUR = 2.0; // ojigi.motion3.json Meta.Duration
export const P008_DELAY_S = OJIGI_DUR + 0.2; // お辞儀 2.0s + 一拍 0.2s
const D = P008_DELAY_S;
const BODY_S = boundaries.body[0] + D;
const BODY_E = boundaries.body[1] + D;
const END_S = boundaries.ending[0] + D;

// 「バイバイ」で手を振る: rms-008.json 解析でエンディングの最終発話塊 = 33.567〜34.0s
// （原音声タイムライン、直前に 0.6s の無音ギャップ）= バイバイ onset。
// 手振りは 0.5s クロスフェードで立ち上がるので onset の 0.25s 前から開始（発話時に腕が上がってる）。
const BAIBAI_ONSET = 33.567;
const WAVE_REL = BAIBAI_ONSET + D - 0.25 - OPEN_END; // motion 時間軸（t=0 = オープナー明け）

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
    // モーションはオープナー分オフセット（t=0 でお辞儀開始。挨拶音声はお辞儀後 = DELAY_S 遅れ）
    const m = motionParamsFor(frame - openerFrames, fps, OJIGI_DUR, WAVE_REL);
    for (const id in m) core.setParameterValueById(id, m[id]);
    // 口: オープナー以降の音声は delayFrames ずれてるので原音声タイムラインへ写像。
    // ギャップ中（お辞儀中）は写像先が原音声のジングル区間になるので口を閉じる。
    const delayFrames = Math.round(D * fps);
    const inGap = frame >= openerFrames && frame < openerFrames + delayFrames;
    const audioFrame = frame < openerFrames ? frame : frame - delayFrames;
    core.setParameterValueById("ParamMouthOpenY", inGap ? 0 : mouth.rmsEasedAt(audioFrame));
    core.setParameterValueById("ParamMouthForm", inGap ? 0 : mouth.mouthFormAt(audioFrame, fps));
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
      {/* 音声を2分割: ジングルはそのまま、挨拶以降はお辞儀分（DELAY_S）遅らせて再生 */}
      <Audio src={staticFile("audio-008.wav")} endAt={openerFrames} />
      <Sequence from={openerFrames + Math.round(D * fps)}>
        <Audio src={staticFile("audio-008.wav")} startFrom={openerFrames} />
      </Sequence>
      <BeckyBackground frame={frame} />
      <BeckyUI frame={frame} layer="back" />
      <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
      <BeckyUI frame={frame} layer="front" showTopic={showTopic} />
      {frame < openerFrames + 2 && <div style={{ position: "absolute", inset: 0, opacity: openerOpacity }}><Opener /></div>}
    </AbsoluteFill>
  );
};
