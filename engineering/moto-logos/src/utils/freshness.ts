/**
 * 鮮度ユーティリティ
 *
 * ワンショット撮影の副産物として lastVerifiedAt が更新される。
 * 経過時間で3段階: clear（1ヶ月）→ hazy（3ヶ月）→ foggy
 */
import { ParkingPin } from '../types';

// ── 型 ──────────────────────────────────────────────────

export type SpotFreshness = 'clear' | 'hazy' | 'foggy';

// ── 閾値 ────────────────────────────────────────────────

export const FRESHNESS_THRESHOLDS: { freshness: SpotFreshness; maxMs: number }[] = [
  { freshness: 'clear', maxMs: 30 * 24 * 60 * 60 * 1000 },  // 1ヶ月以内
  { freshness: 'hazy',  maxMs: 90 * 24 * 60 * 60 * 1000 },  // 3ヶ月以内
];

// ── スタイル ─────────────────────────────────────────────

export const FRESHNESS_STYLE: Record<SpotFreshness, { color: string; opacity: number }> = {
  clear: { color: '#30D158', opacity: 1.0 },   // ビビッドグリーン — 最近の足跡
  hazy:  { color: '#7A9E7E', opacity: 1.0 },   // ミューテッドグリーン — 褪せた足跡
  foggy: { color: '#636366', opacity: 1.0 },    // ニュートラルグレー — 未踏
};

// ── 算出 ─────────────────────────────────────────────────

export function spotFreshness(spot: ParkingPin): SpotFreshness {
  const src = spot.lastConfirmedAt;
  if (!src) return 'foggy';
  const age = Date.now() - new Date(src).getTime();
  for (const t of FRESHNESS_THRESHOLDS) {
    if (age < t.maxMs) return t.freshness;
  }
  return 'foggy';
}

// ── ラベル ───────────────────────────────────────────────

export function freshnessLabel(fresh: SpotFreshness): string {
  switch (fresh) {
    case 'clear': return '確認済み';
    case 'hazy':  return 'しばらく未確認';
    case 'foggy': return '未確認';
  }
}

// ── テキスト ─────────────────────────────────────────────

export function lastConfirmedText(spot: ParkingPin): string {
  const src = spot.lastConfirmedAt;
  if (!src) return 'まだ誰も確認していません';
  const age = Date.now() - new Date(src).getTime();
  const days = Math.floor(age / (24 * 60 * 60 * 1000));
  if (days === 0) return '今日確認されました';
  if (days === 1) return '昨日確認されました';
  if (days < 7) return '今週確認されました';
  if (days < 30) return '今月確認されました';
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}ヶ月前に確認`;
  return 'まだ誰も確認していません';
}
