/**
 * SQLite スポットキャッシュ — Firestore 全件をローカルに保持
 *
 * 初回はチュートリアル中にバックグラウンドDL → SQLite 保存。
 * 2回目以降は SQLite から即時読み込み（<10ms）で地図表示。
 * 24h TTL で全件入れ替え。差分同期はしない（~400KB で十分軽量）。
 */

import { getDatabase } from './database';
import type { ParkingPin, MaxCC } from '../types';

// ─── テーブル初期化 ─────────────────────────────────────

export async function initSpotsCache(): Promise<void> {
  const db = getDatabase();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS spots_cache (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      latitude        REAL NOT NULL,
      longitude       REAL NOT NULL,
      geohash         TEXT,
      maxCC           INTEGER,
      isFree          INTEGER,
      capacity        INTEGER,
      source          TEXT NOT NULL,
      address         TEXT,
      pricePerHour    REAL,
      priceInfo       TEXT,
      openHours       TEXT,
      paymentCash     INTEGER,
      paymentIC       INTEGER,
      paymentQR       INTEGER,
      updatedAt       TEXT,
      lastConfirmedAt TEXT,
      isGuerrilla     INTEGER,
      cachedAt        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_spots_cache_location ON spots_cache(latitude, longitude);
  `);
}

// ─── 書き込み（全件一括 INSERT OR REPLACE） ────────────────

export async function writeSpotsToCache(spots: ParkingPin[]): Promise<void> {
  if (spots.length === 0) return;
  const db = getDatabase();
  const now = new Date().toISOString();
  const CHUNK = 100;

  await db.withTransactionAsync(async () => {
    // 既存キャッシュをクリアして全件入れ替え
    await db.runAsync('DELETE FROM spots_cache');

    for (let i = 0; i < spots.length; i += CHUNK) {
      const chunk = spots.slice(i, i + CHUNK);
      const placeholders = chunk.map(() =>
        '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).join(',');

      const values: (string | number | null)[] = [];
      for (const s of chunk) {
        values.push(
          s.id,
          s.name,
          s.latitude,
          s.longitude,
          null, // geohash — ParkingPin には含まれないが将来用に保持
          s.maxCC ?? null,
          s.isFree === null ? -1 : s.isFree ? 1 : 0,
          s.capacity ?? null,
          s.source,
          s.address ?? null,
          s.pricePerHour ?? null,
          s.priceInfo ?? null,
          s.openHours ?? null,
          s.paymentCash == null ? null : s.paymentCash ? 1 : 0,
          s.paymentIC == null ? null : s.paymentIC ? 1 : 0,
          s.paymentQR == null ? null : s.paymentQR ? 1 : 0,
          s.updatedAt ?? null,
          s.lastConfirmedAt ?? null,
          s.isGuerrilla == null ? null : s.isGuerrilla ? 1 : 0,
          now,
        );
      }

      await db.runAsync(
        `INSERT INTO spots_cache (id,name,latitude,longitude,geohash,maxCC,isFree,capacity,source,address,pricePerHour,priceInfo,openHours,paymentCash,paymentIC,paymentQR,updatedAt,lastConfirmedAt,isGuerrilla,cachedAt) VALUES ${placeholders}`,
        values,
      );
    }
  });
}

// ─── 読み出し ──────────────────────────────────────────

export async function readSpotsFromCache(): Promise<ParkingPin[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM spots_cache',
  );
  return rows.map(rowToPin);
}

// ─── キャッシュメタデータ ──────────────────────────────

export async function getCacheTimestamp(): Promise<string | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ cachedAt: string }>(
    'SELECT cachedAt FROM spots_cache LIMIT 1',
  );
  return row?.cachedAt ?? null;
}

export async function getCachedSpotCount(): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM spots_cache',
  );
  return row?.count ?? 0;
}

// ─── 行→ParkingPin 変換 ───────────────────────────────

function rowToPin(row: Record<string, unknown>): ParkingPin {
  return {
    id: row.id as string,
    name: row.name as string,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    maxCC: (row.maxCC as MaxCC) ?? null,
    isFree: row.isFree === -1 ? null : row.isFree === 1,
    capacity: (row.capacity as number) ?? null,
    source: row.source as ParkingPin['source'],
    address: (row.address as string) ?? undefined,
    pricePerHour: (row.pricePerHour as number) ?? undefined,
    priceInfo: (row.priceInfo as string) ?? undefined,
    openHours: (row.openHours as string) ?? undefined,
    paymentCash: row.paymentCash == null ? undefined : row.paymentCash === 1,
    paymentIC: row.paymentIC == null ? undefined : row.paymentIC === 1,
    paymentQR: row.paymentQR == null ? undefined : row.paymentQR === 1,
    updatedAt: (row.updatedAt as string) ?? undefined,
    lastConfirmedAt: (row.lastConfirmedAt as string) ?? undefined,
    isGuerrilla: row.isGuerrilla == null ? undefined : row.isGuerrilla === 1,
  };
}
