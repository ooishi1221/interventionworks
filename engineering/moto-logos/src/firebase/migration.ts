/**
 * Firestore 移行ロジック（アプリ内実行用）
 * scripts/migrateToFirestore.ts の静的インポート版。
 * DevMigrationScreen から呼び出す。
 */

import {
  collection,
  doc,
  writeBatch,
  Timestamp,
  GeoPoint,
} from 'firebase/firestore';
import { db } from './config';
import { ADACHI_PARKING } from '../data/adachi-parking';
import { getAllUserSpots, getReviews } from '../db/database';
import type { FirestoreSpot, SpotCapacity } from './firestoreTypes';
import type { MaxCC, ParkingPin } from '../types';
import { encodeGeohash } from '../utils/geohash';

// ─────────────────────────────────────────────────────
// ヘルパー: MaxCC → SpotCapacity
// ─────────────────────────────────────────────────────
function maxCCToCapacity(maxCC: MaxCC): SpotCapacity {
  return {
    is50only:  maxCC === 50,
    upTo125:   maxCC === 125,
    upTo400:   maxCC === 250,   // 250cc枠 = 普通二輪区分として扱う
    isLargeOk: maxCC === null,
  };
}

// ─────────────────────────────────────────────────────
// ヘルパー: undefined フィールドを除去（Firestore は undefined 不可）
// ─────────────────────────────────────────────────────
function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

// ─────────────────────────────────────────────────────
// ヘルパー: ParkingPin → FirestoreSpot
// ─────────────────────────────────────────────────────
function pinToFirestoreSpot(pin: ParkingPin): FirestoreSpot {
  const now = Timestamp.now();
  return stripUndefined<FirestoreSpot>({
    name:             pin.name,
    coordinate:       new GeoPoint(pin.latitude, pin.longitude),
    geohash:          encodeGeohash(pin.latitude, pin.longitude, 9),
    ...(pin.address        != null && { address:         pin.address }),
    capacity:         maxCCToCapacity(pin.maxCC),
    ...(pin.capacity       != null && { parkingCapacity: pin.capacity }),
    payment: {
      cash:   true,
      icCard: false,
      qrCode: false,
    },
    isFree:            pin.isFree ?? false,
    ...(pin.pricePerHour  != null && { pricePerHour:    pin.pricePerHour }),
    ...(pin.openHours     != null && { openHours:       pin.openHours }),
    viewCount:         0,
    goodCount:         0,
    badReportCount:    0,
    status:            'active',
    verificationLevel: 'community',
    source:            'seed',
    updatedAt:         now,
    lastVerifiedAt:    now,
    createdAt:         now,
  });
}

export interface MigrationProgress {
  step: 1 | 2 | 3;
  done: number;
  total: number;
  label: string;
}

// ─────────────────────────────────────────────────────
// STEP 1: シードスポット（127件）をアップロード
// ─────────────────────────────────────────────────────
export async function migrateSeedSpots(
  onProgress?: (p: MigrationProgress) => void
): Promise<number> {
  const BATCH_SIZE = 499;
  const total = ADACHI_PARKING.length;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = ADACHI_PARKING.slice(i, i + BATCH_SIZE);

    for (const pin of chunk) {
      const spotRef = doc(collection(db, 'spots'), pin.id);
      batch.set(spotRef, pinToFirestoreSpot(pin));
    }

    await batch.commit();
    onProgress?.({
      step: 1,
      done: Math.min(i + BATCH_SIZE, total),
      total,
      label: `シードスポット ${Math.min(i + BATCH_SIZE, total)}/${total} 件完了`,
    });
  }

  return total;
}

// ─────────────────────────────────────────────────────
// STEP 2: ユーザー登録スポットをアップロード
// ─────────────────────────────────────────────────────
export async function migrateUserSpots(
  onProgress?: (p: MigrationProgress) => void
): Promise<number> {
  const userSpots = await getAllUserSpots();
  if (userSpots.length === 0) {
    onProgress?.({ step: 2, done: 0, total: 0, label: 'ユーザースポットなし（スキップ）' });
    return 0;
  }

  const batch = writeBatch(db);
  for (const spot of userSpots) {
    const now = Timestamp.now();
    const firestoreSpot: FirestoreSpot = stripUndefined<FirestoreSpot>({
      name:             spot.name,
      coordinate:       new GeoPoint(spot.latitude, spot.longitude),
      geohash:          encodeGeohash(spot.latitude, spot.longitude, 9),
      ...(spot.address       != null && { address:         spot.address }),
      capacity:         maxCCToCapacity(spot.maxCC),
      ...(spot.capacity      != null && { parkingCapacity: spot.capacity }),
      payment: {
        cash:   !spot.isFree,
        icCard: false,
        qrCode: false,
      },
      isFree:            spot.isFree,
      ...(spot.pricePerHour != null && { pricePerHour:    spot.pricePerHour }),
      ...(spot.openHours    != null && { openHours:       spot.openHours }),
      viewCount:         0,
      goodCount:         0,
      badReportCount:    0,
      status:            'active',
      verificationLevel: 'community',
      source:            'user',
      updatedAt:         now,
      lastVerifiedAt:    now,
      createdAt:         now,
    });

    const spotRef = doc(collection(db, 'spots'), `user_${spot.id}`);
    batch.set(spotRef, firestoreSpot);
  }

  await batch.commit();
  onProgress?.({
    step: 2,
    done: userSpots.length,
    total: userSpots.length,
    label: `ユーザースポット ${userSpots.length} 件完了`,
  });
  return userSpots.length;
}

// ─────────────────────────────────────────────────────
// STEP 3: ローカルレビューをアップロード
// ─────────────────────────────────────────────────────
export async function migrateReviews(
  anonymousUserId: string,
  onProgress?: (p: MigrationProgress) => void
): Promise<number> {
  let migratedCount = 0;
  const allPins = ADACHI_PARKING;

  for (const pin of allPins) {
    const localReviews = await getReviews(pin.id, pin.source as 'seed' | 'user');
    if (localReviews.length === 0) continue;

    const batch = writeBatch(db);
    for (const review of localReviews) {
      const ts = Timestamp.fromDate(new Date(review.createdAt));
      const reviewRef = doc(collection(db, 'reviews'));
      batch.set(reviewRef, stripUndefined({
        spotId:    pin.id,
        userId:    anonymousUserId,
        score:     review.score,
        ...(review.comment != null && { comment: review.comment }),
        photoUrls: review.photoUri ? [review.photoUri] : [],
        goodCount: 0,
        badCount:  0,
        createdAt: ts,
        updatedAt: ts,
      }));
      migratedCount++;
    }
    await batch.commit();
  }

  onProgress?.({
    step: 3,
    done: migratedCount,
    total: migratedCount,
    label: `レビュー ${migratedCount} 件完了`,
  });
  return migratedCount;
}

// ─────────────────────────────────────────────────────
// フルマイグレーション
// ─────────────────────────────────────────────────────
export interface MigrationResult {
  seedCount:   number;
  userCount:   number;
  reviewCount: number;
}

export async function runFullMigration(
  onProgress?: (p: MigrationProgress) => void
): Promise<MigrationResult> {
  const seedCount   = await migrateSeedSpots(onProgress);
  const userCount   = await migrateUserSpots(onProgress);
  const reviewCount = await migrateReviews('local_user', onProgress);

  return { seedCount, userCount, reviewCount };
}
