import * as SQLite from 'expo-sqlite';

const DB_NAME = 'motopark_butler.db';

let _db: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!_db) {
    _db = SQLite.openDatabaseSync(DB_NAME);
  }
  return _db;
}

/**
 * アプリ起動時に呼ぶ。全テーブルを初期化する。
 */
export async function initDatabase(): Promise<void> {
  const db = getDatabase();

  // WALモードで書き込みパフォーマンス向上
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

    CREATE INDEX IF NOT EXISTS idx_sessions_vehicle ON parking_sessions(vehicleId);
    CREATE INDEX IF NOT EXISTS idx_sessions_spot    ON parking_sessions(spotId);
    CREATE INDEX IF NOT EXISTS idx_spots_location   ON parking_spots(latitude, longitude);
  `);

  await seedInitialData(db);
}

/**
 * 初回起動時のみサンプルデータを投入する
 */
async function seedInitialData(db: SQLite.SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM parking_spots;'
  );
  if (result && result.count > 0) return;

  // 東京都内のサンプル駐輪場
  await db.execAsync(`
    INSERT INTO parking_spots (name, latitude, longitude, address, isFree, capacity)
    VALUES
      ('渋谷駅前駐輪場',    35.6580, 139.7016, '東京都渋谷区道玄坂1', 0, 200),
      ('新宿南口駐輪場',    35.6896, 139.7006, '東京都新宿区新宿3', 0, 150),
      ('秋葉原UDX駐輪場',  35.6984, 139.7731, '東京都千代田区外神田4', 1, 80),
      ('上野公園近辺',      35.7147, 139.7743, '東京都台東区上野公園', 1, 50);
  `);
}

// --- CRUD helpers ---

export async function getAllVehicles() {
  const db = getDatabase();
  return db.getAllAsync<import('../types').Vehicle>('SELECT * FROM vehicles ORDER BY createdAt DESC;');
}

export async function insertVehicle(
  vehicle: Omit<import('../types').Vehicle, 'id' | 'createdAt'>
) {
  const db = getDatabase();
  return db.runAsync(
    `INSERT INTO vehicles (name, type, licensePlate, color, notes)
     VALUES (?, ?, ?, ?, ?);`,
    [vehicle.name, vehicle.type, vehicle.licensePlate ?? null, vehicle.color ?? null, vehicle.notes ?? null]
  );
}

export async function deleteVehicle(id: number) {
  const db = getDatabase();
  return db.runAsync('DELETE FROM vehicles WHERE id = ?;', [id]);
}

export async function getAllParkingSpots() {
  const db = getDatabase();
  return db.getAllAsync<import('../types').ParkingSpot>(
    'SELECT * FROM parking_spots ORDER BY name ASC;'
  );
}

/**
 * 現在地から radius メートル以内の駐輪場を返す (Haversine近似)
 */
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

// --- Utility ---

function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000; // 地球半径 (m)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
