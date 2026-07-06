// midjourney.wav → フレーム毎RMS → 非線形マップ → public/rms-mouth.json（決定的・方式B用）
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

// 引数: [wav] [outJson]。省略時は midjourney(方式B用)。SR/尺は ffprobe で自動取得。
const WAV = process.argv[2] || "public/midjourney.wav";
const OUT = process.argv[3] || "public/rms-mouth.json";
const FPS = 30;
const probe = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a:0",
  "-show_entries", "stream=sample_rate:format=duration", "-of", "default=nw=1", WAV]).toString();
const SR = Number(probe.match(/sample_rate=(\d+)/)[1]);
const DUR = Number(probe.match(/duration=([\d.]+)/)[1]);
const N = Math.ceil(DUR * FPS) + 1;
const spf = SR / FPS;

// s16le mono raw を取り出す
const raw = execFileSync("ffmpeg", ["-v", "error", "-i", WAV, "-ac", "1", "-ar", String(SR), "-f", "s16le", "-"], { maxBuffer: 1 << 29 });
const pcm = new Int16Array(raw.buffer, raw.byteOffset, raw.length >> 1);

const rms = new Float32Array(N);
for (let f = 0; f < N; f++) {
  const s = Math.floor(f * spf), e = Math.min(pcm.length, Math.floor((f + 1) * spf));
  let sum = 0;
  for (let i = s; i < e; i++) { const v = pcm[i] / 32768; sum += v * v; }
  rms[f] = e > s ? Math.sqrt(sum / (e - s)) : 0;
}

// ノイズフロア以下=0、ピーク=0.9、間は非線形(^0.6でピークを張らせる)
const peak = Math.max(...rms);
const FLOOR = peak * 0.06;
const mouth = Array.from(rms, (r) => {
  if (r <= FLOOR) return 0;
  const n = (r - FLOOR) / (peak - FLOOR);
  return +(Math.pow(n, 0.6) * 0.9).toFixed(4);
});
writeFileSync(OUT, JSON.stringify({ fps: FPS, mouth }));
console.log("peak", peak.toFixed(4), "floor", FLOOR.toFixed(4), "nonzero", mouth.filter((x) => x > 0).length, "/", N);
