import lipsyncData from "../public/lipsync.json";
import rmsData from "../public/rms-mouth.json";

type Cue = { start: number; end: number; value: string };

// Rhubarb mouth shape → ParamMouthOpenY の目標値（0..1）
const MOUTH: Record<string, number> = {
  X: 0, A: 0.15, B: 0.25, C: 0.6, D: 0.95, E: 0.5, F: 0.55, G: 0.3, H: 0.45,
};

// 口の横幅 ParamMouthForm: い/え系=横に広げ(+)、う/お系=すぼめる(-)、無音/閉じ=0
const FORM: Record<string, number> = { B: 0.8, C: 0.8, E: -0.8, F: -0.8 };

const cues: Cue[] = lipsyncData.mouthCues;
const DURATION: number = lipsyncData.metadata?.duration ?? 30;

const shapeAt = (seconds: number): string => {
  for (const c of cues) if (seconds >= c.start && seconds < c.end) return c.value;
  return "X";
};
const rawMouthAt = (seconds: number): number => MOUTH[shapeAt(seconds)] ?? 0;

// フレーム決定的な事前計算。Remotion はフレームを順不同/並列で焼き得るので
// 前フレーム状態に依存する平滑化は「毎回0から再計算した配列」でしか成立しない。
// ponytail: fps 別に1度だけ全尺分を組んでキャッシュ。O(n)。
type Baked = { fps: number; mouth: Float32Array; env: Float32Array; form: Float32Array };
let cache: Baked | null = null;

const bake = (fps: number): Baked => {
  if (cache && cache.fps === fps) return cache;
  const n = Math.ceil(DURATION * fps) + 1;
  const mouth = new Float32Array(n);
  // 非対称イージング: 開く(立ち上がり)は速く、閉じるは遅く。子音の細かい山は潰れ母音の山が残る。
  const ATTACK = 0.5; // ~2-3 frame で到達
  const RELEASE = 0.22; // ~4-6 frame でゆっくり閉じる
  let m = 0;
  for (let f = 0; f < n; f++) {
    const target = rawMouthAt(f / fps);
    m += (target - m) * (target > m ? ATTACK : RELEASE);
    mouth[f] = m;
  }
  // 首・体用の声量近似は「フレーズ単位」で動くよう重く平滑化（時定数~0.66s の EMA）。
  // 口の env(速い)とは別物。音節周期(6-7Hz)の追従を殺して首の小刻み震えを消す。
  const env = new Float32Array(n);
  let he = 0;
  const ALPHA = 0.05; // 時定数 ≈ 1/ALPHA/fps ≈ 0.66s
  for (let f = 0; f < n; f++) { he += (mouth[f] - he) * ALPHA; env[f] = he; }
  // 口の横幅は開閉よりさらに緩やかに遷移させる
  const form = new Float32Array(n);
  let ff = 0;
  for (let f = 0; f < n; f++) { ff += ((FORM[shapeAt(f / fps)] ?? 0) - ff) * 0.12; form[f] = ff; }
  cache = { fps, mouth, env, form };
  return cache;
};

const clampIdx = (f: number, n: number) => (f < 0 ? 0 : f >= n ? n - 1 : f);

// 方式A(改良Rhubarb): イージング遅延ぶん cue を lead フレーム前倒しして補償
export const mouthOpenAt = (frame: number, fps: number, lead = 2): number => {
  const b = bake(fps);
  return b.mouth[clampIdx(frame + lead, b.mouth.length)];
};

// 方式A用: 口の横幅（lead で縦の開きと同じく前倒し補償）
export const mouthFormAt = (frame: number, fps: number, lead = 2): number => {
  const b = bake(fps);
  return b.form[clampIdx(frame + lead, b.form.length)];
};

// 方式B(RMS音量駆動): 事前計算した RMS エンベロープを直接使う
const rmsMouth: number[] = rmsData.mouth;
export const rmsMouthAt = (frame: number): number => rmsMouth[clampIdx(frame, rmsMouth.length)];

// 方式C: RMSのタイミング × 非対称イージング（Bのパカつきを潰す）。形は mouthFormAt(Rhubarb)を併用
const rmsEased: number[] = (() => {
  const out: number[] = [];
  let m = 0;
  // C改: 開く方向は速く(attack 0.8≈1-2f、Bのゼロ遅延感に寄せる)、閉じは遅く(0.22、パカつき防止)
  for (const v of rmsMouth) { m += (v - m) * (v > m ? 0.8 : 0.22); out.push(m); }
  return out;
})();
export const rmsEasedAt = (frame: number): number => rmsEased[clampIdx(frame, rmsEased.length)];

// 別音源(pilot通し等)用の口ファクトリ。C改(rmsEased)＋Rhubarb形状(form)を任意データで組む。
// ponytail: midjourney版の上のロジックと薄く重複するが、shipされた既存exportを無傷に保つため分離。
type LipData = { mouthCues: Cue[]; metadata?: { duration?: number } };
export const makeMouth = (lip: LipData, rms: { mouth: number[] }) => {
  const cs = lip.mouthCues;
  const dur = lip.metadata?.duration ?? 30;
  const shape = (s: number): string => {
    for (const c of cs) if (s >= c.start && s < c.end) return c.value;
    return "X";
  };
  const eased = (() => {
    const o: number[] = []; let m = 0;
    for (const v of rms.mouth) { m += (v - m) * (v > m ? 0.8 : 0.22); o.push(m); } // C改
    return o;
  })();
  let fc: { fps: number; form: Float32Array } | null = null;
  const bakeForm = (fps: number) => {
    if (fc?.fps === fps) return fc;
    const n = Math.ceil(dur * fps) + 1;
    const form = new Float32Array(n); let ff = 0;
    for (let f = 0; f < n; f++) { ff += ((FORM[shape(f / fps)] ?? 0) - ff) * 0.12; form[f] = ff; }
    fc = { fps, form }; return fc;
  };
  return {
    rmsEasedAt: (f: number) => eased[clampIdx(f, eased.length)],
    mouthFormAt: (f: number, fps: number, lead = 2) => bakeForm(fps).form[clampIdx(f + lead, bakeForm(fps).form.length)],
  };
};

// 首・体: 高周波sinの頭揺れは廃止。超低周波の呼吸(周期12-15s)を1枚敷き、声量で微増幅(±1〜3度級)。
export const headAt = (frame: number, fps: number) => {
  const b = bake(fps);
  const env = b.env[clampIdx(frame, b.env.length)];
  const t = frame / fps;
  const breath = Math.sin((t / 12) * 2 * Math.PI); // 12s 呼吸
  return {
    angleZ: breath * 1.5 + env * 3.0, // わずかな傾き＋声で揺れる
    angleX: Math.sin((t / 9) * 2 * Math.PI) * 1.2 + env * 2.0, // ゆっくり頷き＋発話で増
    bodyX: Math.sin((t / 15) * 2 * Math.PI) * 1.0 + env * 2.5,
  };
};

// 視線: 数秒周期の遅いsin合成で小さく泳がせて戻す（ParamEyeBall は -1..1）
export const eyeBallAt = (frame: number, fps: number) => {
  const t = frame / fps;
  return {
    x: 0.12 * Math.sin((t / 3.3) * 2 * Math.PI) + 0.05 * Math.sin((t / 1.7) * 2 * Math.PI),
    y: 0.08 * Math.sin((t / 4.1) * 2 * Math.PI),
  };
};

// まばたき: emotion=unease なので気持ち多め（約2.2秒周期）。6フレームだけ閉じる決定的関数。
export const eyeOpenAt = (frame: number): number => {
  const bp = frame % 66;
  return bp < 6 ? Math.abs(bp - 3) / 3 : 1;
};
