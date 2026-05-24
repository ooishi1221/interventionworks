/**
 * 気配ユーティリティ
 *
 * スポットに残された「ライダーの気配」を時間経過で表現する。
 * ワンショット撮影の副産物として lastVerifiedAt が更新される。
 *
 * 気配強度: live → warm → trace → faint → cold → silent（未踏）
 * 色軸: 黄 → 琥珀 → 白 → シアン → 深青 → 中空リング
 */
import { ParkingPin } from '../types';

// ── 型 ──────────────────────────────────────────────────

export type SpotFreshness = 'live' | 'warm' | 'trace' | 'faint' | 'cold' | 'silent';

// ── 閾値 ────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;

export const FRESHNESS_THRESHOLDS: { freshness: SpotFreshness; maxMs: number }[] = [
  { freshness: 'live',  maxMs: 30  * DAY },  // 1ヶ月以内  — 濃い気配
  { freshness: 'warm',  maxMs: 60  * DAY },  // 2ヶ月以内  — 温かい気配
  { freshness: 'trace', maxMs: 90  * DAY },  // 3ヶ月以内  — 痕跡
  { freshness: 'faint', maxMs: 180 * DAY },  // 半年以内    — 薄れた気配
];
// それ以上は 'cold'
// lastConfirmedAt なしは 'silent'

// ── スタイル ─────────────────────────────────────────────
// 温→冷 ダイバージング: 黄 → 琥珀 → 白 → シアン → 深青。
// 選択ピンのオレンジ (#FF6B00) と衝突しない色相帯。

export const FRESHNESS_STYLE: Record<SpotFreshness, { color: string; textColor: string; opacity: number }> = {
  live:   { color: '#FFD60A', textColor: '#1A1A1A', opacity: 1.0 },  // 黄 — 濃い気配
  warm:   { color: '#FFAE42', textColor: '#1A1A1A', opacity: 1.0 },  // 琥珀
  trace:  { color: '#E8E8E8', textColor: '#1A1A1A', opacity: 1.0 },  // 白
  faint:  { color: '#5AC8FA', textColor: '#1A1A1A', opacity: 1.0 },  // シアン
  cold:   { color: '#3A6B9C', textColor: '#FFFFFF', opacity: 1.0 },  // 深青
  silent: { color: 'transparent', textColor: '#9A9A9E', opacity: 1.0 }, // 中空リング
};

// ── 算出 ─────────────────────────────────────────────────

export function spotFreshness(spot: ParkingPin): SpotFreshness {
  const src = spot.lastConfirmedAt;
  if (!src) return 'silent';
  const age = Date.now() - new Date(src).getTime();
  for (const t of FRESHNESS_THRESHOLDS) {
    if (age < t.maxMs) return t.freshness;
  }
  return 'cold';
}

// ── クラスタ気配集約 ────────────────────────────────────
// クラスタ内スポットの気配を加重平均で集約し、代表的な気配レベルを返す。
// live=5, warm=4, trace=3, faint=2, cold=1, silent=0 で数値化→平均→再マッピング。

const FRESHNESS_WEIGHT: Record<SpotFreshness, number> = {
  live: 5, warm: 4, trace: 3, faint: 2, cold: 1, silent: 0,
};

const WEIGHT_TO_FRESHNESS: { min: number; freshness: SpotFreshness }[] = [
  { min: 4.0, freshness: 'live' },
  { min: 3.0, freshness: 'warm' },
  { min: 2.0, freshness: 'trace' },
  { min: 1.0, freshness: 'faint' },
  { min: 0,   freshness: 'cold' },
];

export function clusterFreshness(levels: SpotFreshness[]): SpotFreshness {
  if (levels.length === 0) return 'silent';
  const sum = levels.reduce((acc, l) => acc + FRESHNESS_WEIGHT[l], 0);
  const avg = sum / levels.length;
  for (const t of WEIGHT_TO_FRESHNESS) {
    if (avg >= t.min) return t.freshness;
  }
  return 'cold';
}

// ── ラベル ───────────────────────────────────────────────

export function freshnessLabel(fresh: SpotFreshness): string {
  return fresh;  // そのまま英語ラベルを返す
}

// ── テキスト ─────────────────────────────────────────────

export function lastConfirmedText(spot: ParkingPin): string {
  const src = spot.lastConfirmedAt;
  if (!src) return 'まだ誰も確認していません';
  const age = Date.now() - new Date(src).getTime();
  const days = Math.floor(age / DAY);
  if (days === 0) return '今日確認されました';
  if (days === 1) return '昨日確認されました';
  if (days < 30) return `${days}日前に確認`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}ヶ月前に確認`;
  return 'まだ誰も確認していません';
}
