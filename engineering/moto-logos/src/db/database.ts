import * as SQLite from 'expo-sqlite';
import type { UserSpot, Favorite, MaxCC, Review, ReviewSummary } from '../types';

const DB_NAME = 'motopark_butler.db';

let _db: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!_db) {
    _db = SQLite.openDatabaseSync(DB_NAME);
  }
  return _db;
}

export async function initDatabase(): Promise<void> {
  const db = getDatabase();

  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      type        TEXT    NOT NULL CHECK(type IN ('motorcycle', 'bicycle', 'scooter')),
      licensePlate TEXT,
      color       TEXT,
      notes       TEXT,
      createdAt   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS parking_spots (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      latitude     REAL    NOT NULL,
      longitude    REAL    NOT NULL,
      address      TEXT,
      capacity     INTEGER,
      isFree       INTEGER NOT NULL DEFAULT 1,
      pricePerHour REAL,
      openHours    TEXT,
      notes        TEXT,
      createdAt    TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS parking_sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicleId  INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      spotId     INTEGER NOT NULL REFERENCES parking_spots(id) ON DELETE CASCADE,
      startedAt  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
      endedAt    TEXT,
      notes      TEXT
    );

    CREATE TABLE IF NOT EXISTS user_spots (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      latitude     REAL    NOT NULL,
      longitude    REAL    NOT NULL,
      address      TEXT,
      maxCC        INTEGER,
      isFree       INTEGER NOT NULL DEFAULT 1,
      capacity     INTEGER,
      pricePerHour REAL,
      openHours    TEXT,
      notes        TEXT,
      createdAt    TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      spotId    TEXT    NOT NULL,
      source    TEXT    NOT NULL CHECK(source IN ('seed', 'user')),
      isPinned  INTEGER NOT NULL DEFAULT 0,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(spotId, source)
    );

    CREATE TABLE IF NOT EXISTS ratings (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      spotId    TEXT    NOT NULL,
      source    TEXT    NOT NULL CHECK(source IN ('seed', 'user')),
      score     INTEGER NOT NULL CHECK(score >= 1 AND score <= 5),
      createdAt TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(spotId, source)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_vehicle ON parking_sessions(vehicleId);
    CREATE INDEX IF NOT EXISTS idx_sessions_spot    ON parking_sessions(spotId);
    CREATE INDEX IF NOT EXISTS idx_spots_location   ON parking_spots(latitude, longitude);
    CREATE INDEX IF NOT EXISTS idx_user_spots_loc   ON user_spots(latitude, longitude);

    CREATE TABLE IF NOT EXISTS reviews (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      spotId    TEXT    NOT NULL,
      source    TEXT    NOT NULL CHECK(source IN ('seed', 'user')),
      score     INTEGER NOT NULL CHECK(score >= 1 AND score <= 5),
      comment   TEXT,
      photoUri  TEXT,
      createdAt TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_spot ON reviews(spotId, source);
  `);

  // rider_stats テーブル（確認報告カウンター等）
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS rider_stats (
      key   TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );
  `);

  // activity_log テーブル（アクティビティタイムライン用）
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      type      TEXT    NOT NULL,
      label     TEXT    NOT NULL,
      detail    TEXT,
      createdAt TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // footprints テーブル（足跡地図用）
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS footprints (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      spotId    TEXT    NOT NULL,
      spotName  TEXT    NOT NULL,
      latitude  REAL    NOT NULL,
      longitude REAL    NOT NULL,
      type      TEXT    NOT NULL DEFAULT 'parked',
      createdAt TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_footprints_created ON footprints(createdAt DESC);
  `);

  // parking_history テーブル（駐車履歴 — Firestoreスポット対応）
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS parking_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      spotId     TEXT    NOT NULL,
      spotName   TEXT    NOT NULL,
      latitude   REAL    NOT NULL,
      longitude  REAL    NOT NULL,
      vehicleId  INTEGER,
      startedAt  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
      endedAt    TEXT,
      notes      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_parking_history_started ON parking_history(startedAt DESC);
  `);

  // マイグレーション: favorites に isPinned / sortOrder カラムを追加（既存DB対応）
  try {
    await db.execAsync(`ALTER TABLE favorites ADD COLUMN isPinned INTEGER NOT NULL DEFAULT 0;`);
  } catch { /* already exists */ }
  try {
    await db.execAsync(`ALTER TABLE favorites ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0;`);
  } catch { /* already exists */ }

  // マイグレーション: vehicles にバイクプロフィールカラムを追加
  const vehicleMigrations = [
    `ALTER TABLE vehicles ADD COLUMN cc INTEGER;`,
    `ALTER TABLE vehicles ADD COLUMN manufacturer TEXT;`,
    `ALTER TABLE vehicles ADD COLUMN model TEXT;`,
    `ALTER TABLE vehicles ADD COLUMN year INTEGER;`,
    `ALTER TABLE vehicles ADD COLUMN photoUrl TEXT;`,
    `ALTER TABLE vehicles ADD COLUMN tagline TEXT;`,
  ];
  for (const sql of vehicleMigrations) {
    try { await db.execAsync(sql); } catch { /* already exists */ }
  }

  await seedInitialData(db);
}

async function seedInitialData(db: SQLite.SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM parking_spots;'
  );
  if (result && result.count > 0) return;

  await db.execAsync(`
    INSERT INTO parking_spots (name, latitude, longitude, address, isFree, capacity)
    VALUES
      ('渋谷駅前駐輪場',    35.6580, 139.7016, '東京都渋谷区道玄坂1', 0, 200),
      ('新宿南口駐輪場',    35.6896, 139.7006, '東京都新宿区新宿3', 0, 150),
      ('秋葉原UDX駐輪場',  35.6984, 139.7731, '東京都千代田区外神田4', 1, 80),
      ('上野公園近辺',      35.7147, 139.7743, '東京都台東区上野公園', 1, 50);
  `);
}

// --- Vehicles ---

export async function getAllVehicles() {
  const db = getDatabase();
  return db.getAllAsync<import('../types').Vehicle>('SELECT * FROM vehicles ORDER BY createdAt DESC;');
}

export async function insertVehicle(
  vehicle: Omit<import('../types').Vehicle, 'id' | 'createdAt'>
) {
  const db = getDatabase();
  return db.runAsync(
    `INSERT INTO vehicles (name, type, cc, manufacturer, model, year, color, photoUrl, tagline, licensePlate, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [vehicle.name, vehicle.type, vehicle.cc ?? null, vehicle.manufacturer ?? null, vehicle.model ?? null, vehicle.year ?? null, vehicle.color ?? null, vehicle.photoUrl ?? null, vehicle.tagline ?? null, vehicle.licensePlate ?? null, vehicle.notes ?? null]
  );
}

export async function updateVehicle(id: number, vehicle: Omit<import('../types').Vehicle, 'id' | 'createdAt'>) {
  const db = getDatabase();
  return db.runAsync(
    `UPDATE vehicles SET name=?, type=?, cc=?, manufacturer=?, model=?, year=?, color=?, photoUrl=?, tagline=?, licensePlate=?, notes=? WHERE id=?;`,
    [vehicle.name, vehicle.type, vehicle.cc ?? null, vehicle.manufacturer ?? null, vehicle.model ?? null, vehicle.year ?? null, vehicle.color ?? null, vehicle.photoUrl ?? null, vehicle.tagline ?? null, vehicle.licensePlate ?? null, vehicle.notes ?? null, id]
  );
}

export async function getFirstVehicle(): Promise<import('../types').Vehicle | null> {
  const db = getDatabase();
  return db.getFirstAsync<import('../types').Vehicle>('SELECT * FROM vehicles ORDER BY id ASC LIMIT 1;');
}

export async function deleteVehicle(id: number) {
  const db = getDatabase();
  return db.runAsync('DELETE FROM vehicles WHERE id = ?;', [id]);
}

// --- Parking Spots ---

export async function getAllParkingSpots() {
  const db = getDatabase();
  return db.getAllAsync<import('../types').ParkingSpot>(
    'SELECT * FROM parking_spots ORDER BY name ASC;'
  );
}

export async function getNearbySpots(
  lat: number,
  lon: number,
  radiusMeters: number = 500
): Promise<import('../types').ParkingSpot[]> {
  const db = getDatabase();
  const all = await db.getAllAsync<import('../types').ParkingSpot>(
    'SELECT * FROM parking_spots;'
  );
  return all.filter((spot) => {
    const dist = haversineDistance(lat, lon, spot.latitude, spot.longitude);
    return dist <= radiusMeters;
  });
}

export async function startParkingSession(vehicleId: number, spotId: number) {
  const db = getDatabase();
  return db.runAsync(
    `INSERT INTO parking_sessions (vehicleId, spotId) VALUES (?, ?);`,
    [vehicleId, spotId]
  );
}

export async function endParkingSession(sessionId: number) {
  const db = getDatabase();
  return db.runAsync(
    `UPDATE parking_sessions SET endedAt = datetime('now', 'localtime') WHERE id = ?;`,
    [sessionId]
  );
}

// --- User Spots ---

export async function getAllUserSpots(): Promise<UserSpot[]> {
  const db = getDatabase();
  /** SQLite stores booleans as integers: 1=true, 0=false, -1=null */
  interface UserSpotRow extends Omit<UserSpot, 'isFree' | 'maxCC'> {
    isFree: number;
    maxCC: number | null;
  }
  const rows = await db.getAllAsync<UserSpotRow>('SELECT * FROM user_spots ORDER BY createdAt DESC;');
  return rows.map((row) => ({
    ...row,
    isFree: row.isFree === -1 ? null : row.isFree === 1,
    maxCC: (row.maxCC ?? null) as MaxCC,
  }));
}

export async function insertUserSpot(
  spot: Omit<UserSpot, 'id' | 'createdAt'>
): Promise<number> {
  const db = getDatabase();
  const result = await db.runAsync(
    `INSERT INTO user_spots (name, latitude, longitude, address, maxCC, isFree, capacity, pricePerHour, openHours, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      spot.name,
      spot.latitude,
      spot.longitude,
      spot.address ?? null,
      spot.maxCC ?? null,
      spot.isFree === null ? -1 : spot.isFree ? 1 : 0,
      spot.capacity ?? null,
      spot.pricePerHour ?? null,
      spot.openHours ?? null,
      spot.notes ?? null,
    ]
  );
  return result.lastInsertRowId;
}

export async function deleteUserSpot(id: number) {
  const db = getDatabase();
  return db.runAsync('DELETE FROM user_spots WHERE id = ?;', [id]);
}

// --- Update User Spot ---

export async function updateUserSpot(
  id: number,
  spot: Omit<UserSpot, 'id' | 'createdAt'>
): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `UPDATE user_spots SET name=?, latitude=?, longitude=?, address=?, maxCC=?, isFree=?, capacity=?, pricePerHour=?, openHours=?, notes=? WHERE id=?;`,
    [
      spot.name,
      spot.latitude,
      spot.longitude,
      spot.address ?? null,
      spot.maxCC ?? null,
      spot.isFree === null ? -1 : spot.isFree ? 1 : 0,
      spot.capacity ?? null,
      spot.pricePerHour ?? null,
      spot.openHours ?? null,
      spot.notes ?? null,
      id,
    ]
  );
}

// --- Favorites ---

export async function getAllFavorites(): Promise<Favorite[]> {
  const db = getDatabase();
  return db.getAllAsync<Favorite>(
    'SELECT * FROM favorites ORDER BY isPinned DESC, sortOrder ASC, createdAt DESC;'
  );
}

export async function addFavorite(spotId: string, source: 'seed' | 'user'): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `INSERT OR IGNORE INTO favorites (spotId, source) VALUES (?, ?);`,
    [spotId, source]
  );
}

export async function removeFavorite(spotId: string, source: 'seed' | 'user'): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `DELETE FROM favorites WHERE spotId = ? AND source = ?;`,
    [spotId, source]
  );
}

export async function toggleFavoritePinned(spotId: string, source: 'seed' | 'user'): Promise<boolean> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ isPinned: number }>(
    'SELECT isPinned FROM favorites WHERE spotId = ? AND source = ?;',
    [spotId, source]
  );
  const newVal = row?.isPinned === 1 ? 0 : 1;
  await db.runAsync(
    'UPDATE favorites SET isPinned = ? WHERE spotId = ? AND source = ?;',
    [newVal, spotId, source]
  );
  return newVal === 1;
}

export async function updateFavoriteSortOrder(
  items: { spotId: string; source: 'seed' | 'user'; sortOrder: number }[]
): Promise<void> {
  const db = getDatabase();
  for (const item of items) {
    await db.runAsync(
      'UPDATE favorites SET sortOrder = ? WHERE spotId = ? AND source = ?;',
      [item.sortOrder, item.spotId, item.source]
    );
  }
}

export async function isFavorite(spotId: string, source: 'seed' | 'user'): Promise<boolean> {
  const db = getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM favorites WHERE spotId = ? AND source = ?;`,
    [spotId, source]
  );
  return (result?.count ?? 0) > 0;
}

// --- Ratings ---

export async function getRating(spotId: string, source: 'seed' | 'user'): Promise<number | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ score: number }>(
    `SELECT score FROM ratings WHERE spotId = ? AND source = ?;`,
    [spotId, source]
  );
  return row?.score ?? null;
}

export async function setRating(spotId: string, source: 'seed' | 'user', score: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `INSERT INTO ratings (spotId, source, score) VALUES (?, ?, ?)
     ON CONFLICT(spotId, source) DO UPDATE SET score=excluded.score, createdAt=datetime('now','localtime');`,
    [spotId, source, score]
  );
}

// --- Reviews (レガシー: マイグレーション用に getReviews のみ残す) ---
// 通常の読み書きは Firestore (firestoreService.ts) を使用

export async function getReviews(
  spotId: string,
  source: 'seed' | 'user',
  sortBy: 'date' | 'score' = 'date'
): Promise<Review[]> {
  const db = getDatabase();
  const order = sortBy === 'score' ? 'score DESC, createdAt DESC' : 'createdAt DESC';
  return db.getAllAsync<Review>(
    `SELECT * FROM reviews WHERE spotId = ? AND source = ? ORDER BY ${order};`,
    [spotId, source]
  );
}

// --- Rider Stats ---

export async function incrementStat(key: string, delta = 1): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `INSERT INTO rider_stats (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = value + ?;`,
    [key, delta, delta]
  );
}

export async function getStat(key: string): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ value: number }>(
    'SELECT value FROM rider_stats WHERE key = ?;', [key]
  );
  return row?.value ?? 0;
}

export async function getFavoriteCount(): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM favorites;'
  );
  return row?.count ?? 0;
}

export async function getExploredPrefectures(): Promise<number> {
  const db = getDatabase();
  // address カラムから都道府県を抽出してユニーク数をカウント
  const rows = await db.getAllAsync<{ address: string | null }>(
    'SELECT DISTINCT address FROM user_spots WHERE address IS NOT NULL;'
  );
  const prefs = new Set<string>();
  for (const r of rows) {
    if (!r.address) continue;
    // 「東京都...」「神奈川県...」のように先頭の都道府県を抽出
    const m = r.address.match(/^(.+?[都道府県])/);
    if (m) prefs.add(m[1]);
  }
  return prefs.size;
}

// --- Activity Log ---

export type ActivityType = 'spot' | 'review' | 'report' | 'favorite';

export interface ActivityLogEntry {
  id: number;
  type: ActivityType;
  label: string;
  detail: string | null;
  createdAt: string;
}

export async function logActivityLocal(type: ActivityType, label: string, detail?: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    'INSERT INTO activity_log (type, label, detail) VALUES (?, ?, ?);',
    [type, label, detail ?? null]
  );
}

export async function getRecentActivity(limit = 20): Promise<ActivityLogEntry[]> {
  const db = getDatabase();
  return db.getAllAsync<ActivityLogEntry>(
    'SELECT * FROM activity_log ORDER BY createdAt DESC LIMIT ?;',
    [limit]
  );
}

// --- Parking History ---

export interface ParkingSession {
  id: number;
  spotId: string;
  spotName: string;
  latitude: number;
  longitude: number;
  vehicleId: number | null;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
}

export async function startParking(
  spotId: string, spotName: string, latitude: number, longitude: number, vehicleId?: number,
): Promise<number> {
  const db = getDatabase();
  const result = await db.runAsync(
    'INSERT INTO parking_history (spotId, spotName, latitude, longitude, vehicleId) VALUES (?, ?, ?, ?, ?);',
    [spotId, spotName, latitude, longitude, vehicleId ?? null],
  );
  return result.lastInsertRowId;
}

export async function endParking(sessionId: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    `UPDATE parking_history SET endedAt = datetime('now', 'localtime') WHERE id = ?;`,
    [sessionId],
  );
}

export async function getActiveParkingSession(): Promise<ParkingSession | null> {
  const db = getDatabase();
  return db.getFirstAsync<ParkingSession>(
    'SELECT * FROM parking_history WHERE endedAt IS NULL ORDER BY startedAt DESC LIMIT 1;',
  );
}

/** 指定時間を超過したアクティブセッションを終了し、終了したセッション一覧を返す */
export async function expireOldParkingSessions(maxAgeMs: number): Promise<ParkingSession[]> {
  const db = getDatabase();
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString().replace('T', ' ').slice(0, 19);
  const expired = await db.getAllAsync<ParkingSession>(
    'SELECT * FROM parking_history WHERE endedAt IS NULL AND startedAt < ?;',
    [cutoff],
  );
  if (expired.length > 0) {
    await db.runAsync(
      `UPDATE parking_history SET endedAt = datetime('now', 'localtime') WHERE endedAt IS NULL AND startedAt < ?;`,
      [cutoff],
    );
  }
  return expired;
}

export async function getParkingHistory(limit = 50): Promise<ParkingSession[]> {
  const db = getDatabase();
  return db.getAllAsync<ParkingSession>(
    'SELECT * FROM parking_history ORDER BY startedAt DESC LIMIT ?;',
    [limit],
  );
}

// --- Footprints ---

export interface Footprint {
  id: number;
  spotId: string;
  spotName: string;
  latitude: number;
  longitude: number;
  type: string;
  createdAt: string;
}

export async function addFootprint(
  spotId: string, spotName: string, latitude: number, longitude: number, type = 'parked'
): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    'INSERT INTO footprints (spotId, spotName, latitude, longitude, type) VALUES (?, ?, ?, ?, ?);',
    [spotId, spotName, latitude, longitude, type],
  );
}

export async function getFootprints(limit = 100): Promise<Footprint[]> {
  const db = getDatabase();
  return db.getAllAsync<Footprint>(
    'SELECT * FROM footprints ORDER BY createdAt DESC LIMIT ?;',
    [limit],
  );
}

export async function getFootprintCount(): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM footprints;',
  );
  return row?.count ?? 0;
}

export async function getUniqueFootprintLocations(): Promise<Footprint[]> {
  const db = getDatabase();
  return db.getAllAsync<Footprint>(
    `SELECT *, MAX(createdAt) as createdAt FROM footprints GROUP BY spotId ORDER BY createdAt DESC;`,
  );
}

// --- Utility ---

function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
