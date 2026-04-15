/**
 * 駐車温度ユーティリティ — 共有定義
 *
 * ライダーが到着するとスポットが「温まる」。時間とともに冷める。
 * lastArrivedAt（= Firestore currentParkedAt）の経過時間で5段階。
 */
import { ParkingPin } from '../types';

export type SpotTemperature = 'blazing' | 'hot' | 'warm' | 'cool' | 'cold';

export const TEMP_THRESHOLDS: { temp: SpotTemperature; maxMs: number }[] = [
  { temp: 'blazing', maxMs: 30 * 60 * 1000 },     // 30分以内
  { temp: 'hot',     maxMs: 2 * 60 * 60 * 1000 },  // 2時間以内
  { temp: 'warm',    maxMs: 6 * 60 * 60 * 1000 },  // 6時間以内
  { temp: 'cool',    maxMs: 24 * 60 * 60 * 1000 }, // 24時間以内
];

export const TEMP_STYLE: Record<SpotTemperature, { color: string; pulseScale: number; auraDuration: number }> = {
  blazing: { color: '#FF3B30', pulseScale: 1.4, auraDuration: 800 },
  hot:     { color: '#FF6B00', pulseScale: 1.25, auraDuration: 1200 },
  warm:    { color: '#FF9F0A', pulseScale: 1.1, auraDuration: 2000 },
  cool:    { color: '#64D2FF', pulseScale: 1.0, auraDuration: 0 },
  cold:    { color: '#48484A', pulseScale: 1.0, auraDuration: 0 },
};

export function spotTemperature(spot: ParkingPin): SpotTemperature {
  if (!spot.lastArrivedAt) return 'cold';
  const age = Date.now() - new Date(spot.lastArrivedAt).getTime();
  for (const t of TEMP_THRESHOLDS) {
    if (age < t.maxMs) return t.temp;
  }
  return 'cold';
}

/** 温度ラベル（UIバッジ用） */
export function temperatureLabel(temp: SpotTemperature): string {
  switch (temp) {
    case 'blazing':
    case 'hot':
      return '🔥 足跡あり';
    case 'warm':
      return '少し前に利用';
    case 'cool':
      return 'しばらく利用なし';
    case 'cold':
      return '未確認';
  }
}

/** 「Xh前にライダーが利用」or「あなたが最初の足跡を残せます」 */
export function lastArrivedText(spot: ParkingPin): string {
  if (!spot.lastArrivedAt) return 'あなたが最初の足跡を残せます';
  const age = Date.now() - new Date(spot.lastArrivedAt).getTime();
  const mins = Math.floor(age / 60000);
  if (mins < 1) return 'たった今ライダーが利用';
  if (mins < 60) return `${mins}分前にライダーが利用`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前にライダーが利用`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}日前にライダーが利用`;
  return 'あなたが最初の足跡を残せます';
}
