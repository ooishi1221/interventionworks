/**
 * 霧鮮度ユーティリティ — Fog of War システム
 *
 * ライダーが「停めた」を確認するとスポットの霧が晴れる。
 * 時間経過で霧が戻る。lastConfirmedAt の経過時間で3段階。
 *
 * 旧: temperature.ts（時間単位の5段階温度）→ 月単位の3段階鮮度に置換
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
  clear: { color: '#30D158', opacity: 1.0 },   // 緑 — 確認済み（光る）
  hazy:  { color: '#FF9F0A', opacity: 0.55 },  // アンバー — やや古い
  foggy: { color: '#636366', opacity: 0.3 },    // 暗グレー — 霧の中（ほぼ消えかけ）
};

// ── 算出 ─────────────────────────────────────────────────

export function spotFreshness(spot: ParkingPin): SpotFreshness {
  const src = spot.lastConfirmedAt ?? spot.lastArrivedAt;
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
  const src = spot.lastConfirmedAt ?? spot.lastArrivedAt;
  if (!src) return 'まだ誰も確認していません';
  const age = Date.now() - new Date(src).getTime();
  const mins = Math.floor(age / 60000);
  if (mins < 1) return 'たった今確認されました';
  if (mins < 60) return `${mins}分前に確認`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前に確認`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}日前に確認`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}ヶ月前に確認`;
  return 'まだ誰も確認していません';
}
