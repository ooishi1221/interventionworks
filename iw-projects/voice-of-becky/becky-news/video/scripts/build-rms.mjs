// midjourney.wav → フレーム毎RMS → 非線形マップ → public/rms-mouth.json（決定的・方式B用）
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const WAV = "public/midjourney.wav";
const SR = 16000, FPS = 30, N = 900;
const spf = SR / FPS;

// s16le mono raw を取り出す
const raw = execFileSync("ffmpeg", ["-v", "error", "-i", WAV, "-ac", "1", "-ar", String(SR), "-f", "s16le", "-"], { maxBuffer: 1 << 28 });
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
writeFileSync("public/rms-mouth.json", JSON.stringify({ fps: FPS, mouth }));
console.log("peak", peak.toFixed(4), "floor", FLOOR.toFixed(4), "nonzero", mouth.filter((x) => x > 0).length, "/", N);
