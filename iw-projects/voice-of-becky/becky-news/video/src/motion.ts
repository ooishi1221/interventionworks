import idleJson from "../public/model/motions/becky_idle.motion3.json";
import odorokuJson from "../public/model/odoroku.motion3.json";
import ojigiJson from "../public/model/ojigi.motion3.json";
import waveJson from "../public/model/tewohuru.motion3.json";

// Cubism motion3.json のカーブを時刻tで評価する最小サンプラ。
// 内蔵モーションマネージャーは real-time dt で回り決定性が壊れるので、
// フレーム→秒→カーブ評価を自前でやって determinism を保つ。
type Motion = { duration: number; curves: { id: string; seg: number[] }[] };

const parse = (j: any): Motion => ({
  duration: j.Meta.Duration,
  curves: (j.Curves as any[])
    .filter((c) => c.Target === "Parameter")
    .map((c) => ({ id: c.Id, seg: c.Segments })),
});

const OJIGI = parse(ojigiJson);
const IDLE = parse(idleJson);
const WAVE = parse(waveJson);
const ODOROKU = parse(odorokuJson);

// セグメント配列: [t0,v0, type, ...pts, type, ...pts]。
// type 0=Linear,1=Bezier(cp1,cp2,end=6値),2=Stepped,3=InverseStepped。
const evalCurve = (s: number[], time: number): number => {
  let t0 = s[0], v0 = s[1];
  if (time <= t0) return v0;
  let i = 2;
  while (i < s.length) {
    const type = s[i++];
    if (type === 1) {
      const c1v = s[i + 1], c2v = s[i + 3], et = s[i + 4], ev = s[i + 5];
      i += 6;
      if (time <= et) {
        const u = (time - t0) / (et - t0); // Cubism 同様、正規化時刻で値を de Casteljau
        const a = v0 + (c1v - v0) * u, b = c1v + (c2v - c1v) * u, c = c2v + (ev - c2v) * u;
        const d = a + (b - a) * u, e = b + (c - b) * u;
        return d + (e - d) * u;
      }
      t0 = et; v0 = ev;
    } else {
      const t1 = s[i], v1 = s[i + 1];
      i += 2;
      if (time <= t1) {
        if (type === 2) return v0; // stepped
        if (type === 3) return v1; // inverse-stepped
        return v0 + (v1 - v0) * ((time - t0) / (t1 - t0)); // linear
      }
      t0 = t1; v0 = v1;
    }
  }
  return v0;
};

const sample = (m: Motion, local: number): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const c of m.curves) out[c.id] = evalCurve(c.seg, local);
  return out;
};

// 番組進行: 0-2.5s お辞儀 → idle ループ → 27s から手振り。切替は 0.5s クロスフェード。
const T_OJIGI = 2.5, XF = 0.5, T_WAVE = 27;

export const motionParamsAt = (frame: number, fps: number): Record<string, number> => {
  const t = frame / fps;
  const wOjigi = t < T_OJIGI ? 1 : t < T_OJIGI + XF ? 1 - (t - T_OJIGI) / XF : 0;
  // 手振りは専用パラメータ(ParamTewohuruL/R)だけなので idle の上に加算＝体は生きたまま
  const wWave = t < T_WAVE ? 0 : t < T_WAVE + XF ? (t - T_WAVE) / XF : 1;
  const wIdle = Math.max(0, 1 - wOjigi);

  const acc: Record<string, number> = {};
  const add = (d: Record<string, number>, w: number) => {
    if (w <= 0) return;
    for (const k in d) acc[k] = (acc[k] || 0) + d[k] * w;
  };
  add(sample(OJIGI, Math.min(t, OJIGI.duration)), wOjigi); // お辞儀は1回（末尾で保持）
  add(sample(IDLE, t % IDLE.duration), wIdle);
  add(sample(WAVE, (t - T_WAVE) % WAVE.duration), wWave);
  return acc;
};

// 台本の境界時刻でモーションを配置する版（通しサンプル用）: opening=ojigi / body=idle / ending=手振り
// odorokuStart: 驚きモーションを1回だけ再生する開始秒（省略時なし）。
// odoroku は AngleX/Y 等 idle と同じパラメータを動かすので、再生中は idle の重みを引く（加算で二重に揺れない）。
export const motionParamsFor = (frame: number, fps: number, ojigiEnd: number, waveStart: number, odorokuStart = Infinity): Record<string, number> => {
  const t = frame / fps;
  const wOjigi = t < ojigiEnd ? 1 : t < ojigiEnd + XF ? 1 - (t - ojigiEnd) / XF : 0;
  const wWave = t < waveStart ? 0 : t < waveStart + XF ? (t - waveStart) / XF : 1;
  const oT = t - odorokuStart; // odoroku ローカル時刻
  const oD = ODOROKU.duration;
  const wOdo = oT < 0 ? 0 : oT < XF ? oT / XF : oT < oD - XF ? 1 : oT < oD ? (oD - oT) / XF : 0;
  const wIdle = Math.max(0, 1 - wOjigi - wOdo);
  const acc: Record<string, number> = {};
  const add = (d: Record<string, number>, w: number) => {
    if (w <= 0) return;
    for (const k in d) acc[k] = (acc[k] || 0) + d[k] * w;
  };
  add(sample(OJIGI, Math.min(t, OJIGI.duration)), wOjigi);
  add(sample(IDLE, t % IDLE.duration), wIdle);
  add(sample(WAVE, Math.max(0, t - waveStart) % WAVE.duration), wWave);
  add(sample(ODOROKU, Math.min(Math.max(0, oT), oD)), wOdo);
  return acc;
};
