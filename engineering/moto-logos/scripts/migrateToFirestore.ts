/**
 * SQLite → Firestore 移行スクリプト（下書き）
 * ⚠️  このスクリプトは直接実行しないこと。
 *     .env に Firebase Config が設定されたあとに実行する。
 *
 * 移行対象:
 *   1. ADACHI_PARKING（シードデータ 127件）→ spots コレクション
 *   2. ユーザー登録スポット（user_spots テーブル）→ spots コレクション
 *   3. ローカルレビュー（reviews テーブル）→ reviews コレクション
 *
 * 実行方法（準備完了後）:
 *   expo-router や一時的なデバッグ画面からこのファイルの
 *   migrateSeedSpotsToFirestore() を呼び出す。
 */

import {
  collection,
  doc,
  writeBatch,
  Timestamp,
  GeoPoint,
} from 'firebase/firestore';
import { db } from '../src/firebase/config';
import { ADACHI_PARKING } from '../src/data/adachi-parking';
import type {
  FirestoreSpot,
  SpotCapacity,
  COLLECTIONS,
} from '../src/firebase/firestoreTypes';
import type { MaxCC, ParkingPin } from '../src/types';

// ─────────────────────────────────────────────────────
// ヘルパー: MaxCC → SpotCapacity 変換
// ─────────────────────────────────────────────────────
function maxCCToCapacity(maxCC: MaxCC): SpotCapacity {
  return {
    is50only:  maxCC === 50,
    upTo125:   maxCC === 125,
    upTo400:   maxCC === 250,  // 250cc枠 = 普通二輪区分として扱う
    isLargeOk: maxCC === null,
  };
}

// ─────────────────────────────────────────────────────
// ヘルパー: ParkingPin → FirestoreSpot 変換
// ─────────────────────────────────────────────────────
function pinToFirestoreSpot(pin: ParkingPin): FirestoreSpot {
  const now = Timestamp.now();
  return {
    name:             pin.name,
    coordinate:       new GeoPoint(pin.latitude, pin.longitude),
    address:          pin.address,
    capacity:         maxCCToCapacity(pin.maxCC),
    parkingCapacity:  pin.capacity ?? undefined,
    payment: {
      cash:   true,   // シードデータは精算方法不明のためデフォルト現金のみ
      icCard: false,
      qrCode: false,
    },
    isFree:            pin.isFree ?? false,
    pricePerHour:      pin.pricePerHour,
    openHours:         pin.openHours,
    viewCount:         0,
    goodCount:         0,
    badReportCount:    0,
    status:            'active',
    verificationLevel: 'community',
    source:            'seed',
    updatedAt:         now,
    lastVerifiedAt:    now,
    createdAt:         now,
  };
}

// ─────────────────────────────────────────────────────
// STEP 1: シードスポット（127件）を Firestore にアップロード
// ─────────────────────────────────────────────────────
export async function migrateSeedSpotsToFirestore(
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const BATCH_SIZE = 499; // Firestore バッチ上限 500 に対して余裕を持たせる
  const total = ADACHI_PARKING.length;

  console.log(`[Migration] STEP1 開始: シードスポット ${total}件`);

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = ADACHI_PARKING.slice(i, i + BATCH_SIZE);

    for (const pin of chunk) {
      // ドキュメントIDはローカルの seed_XXX をそのまま流用
      const spotRef = doc(collection(db, 'spots'), pin.id);
      batch.set(spotRef, pinToFirestoreSpot(pin));
    }

    await batch.commit();
    onProgress?.(Math.min(i + BATCH_SIZE, total), total);
    console.log(`[Migration] バッチ完了 ${Math.min(i + BATCH_SIZE, total)}/${total}`);
  }

  console.log('[Migration] STEP1 完了');
}

// ─────────────────────────────────────────────────────
// STEP 2: ユーザー登録スポットを Firestore にアップロード
// （SQLite の user_spots テーブルから取得）
// ─────────────────────────────────────────────────────
export async function migrateUserSpotsToFirestore(): Promise<void> {
  // ローカルDBからユーザー登録スポットを取得
  const { getAllUserSpots } = await import('../src/db/database');
  const userSpots = await getAllUserSpots();

  if (userSpots.length === 0) {
    console.log('[Migration] STEP2: ユーザー登録スポットなし、スキップ');
    return;
  }

  console.log(`[Migration] STEP2 開始: ユーザースポット ${userSpots.length}件`);
  const batch = writeBatch(db);

  for (const spot of userSpots) {
    const now = Timestamp.now();
    const firestoreSpot: FirestoreSpot = {
      name:             spot.name,
      coordinate:       new GeoPoint(spot.latitude, spot.longitude),
      address:          spot.address,
      capacity:         maxCCToCapacity(spot.maxCC),
      parkingCapacity:  spot.capacity,
      payment: {
        cash:   spot.isFree ? false : true,
        icCard: false,
        qrCode: false,
      },
      isFree:            spot.isFree,
      pricePerHour:      spot.pricePerHour,
      openHours:         spot.openHours,
      viewCount:         0,
      goodCount:         0,
      badReportCount:    0,
      status:            'active',
      verificationLevel: 'community',
      source:            'user',
      updatedAt:         now,
      lastVerifiedAt:    now,
      createdAt:         now,
    };

    // ドキュメントIDは "user_{localId}" 形式
    const spotRef = doc(collection(db, 'spots'), `user_${spot.id}`);
    batch.set(spotRef, firestoreSpot);
  }

  await batch.commit();
  console.log('[Migration] STEP2 完了');
}

// ─────────────────────────────────────────────────────
// STEP 3: ローカルレビューを Firestore にアップロード
// （SQLite の reviews テーブルから取得）
// ─────────────────────────────────────────────────────
export async function migrateReviewsToFirestore(
  anonymousUserId: string  // まだ Auth なしの場合は仮 ID を渡す
): Promise<void> {
  const { getReviews } = await import('../src/db/database');

  // 全スポット分のレビューを収集（シード＋ユーザー）
  const allPins = ADACHI_PARKING;
  let migratedCount = 0;

  for (const pin of allPins) {
    const localReviews = await getReviews(pin.id, pin.source as 'seed' | 'user');
    if (localReviews.length === 0) continue;

    const batch = writeBatch(db);
    for (const review of localReviews) {
      const now = Timestamp.fromDate(new Date(review.createdAt));
      const reviewRef = doc(collection(db, 'reviews'));
      batch.set(reviewRef, {
        spotId:    pin.id,
        userId:    anonymousUserId,
        score:     review.score,
        comment:   review.comment ?? undefined,
        photoUrls: review.photoUri ? [review.photoUri] : [],
        goodCount: 0,
        badCount:  0,
        createdAt: now,
        updatedAt: now,
      });
      migratedCount++;
    }
    await batch.commit();
  }

  console.log(`[Migration] STEP3 完了: レビュー ${migratedCount}件`);
}

// ─────────────────────────────────────────────────────
// フルマイグレーション（STEP 1〜3 を順番に実行）
// ─────────────────────────────────────────────────────
export async function runFullMigration(
  anonymousUserId = 'local_user',
  onProgress?: (step: number, done: number, total: number) => void
): Promise<void> {
  console.log('=== Moto-Logos Firestore 移行開始 ===');

  await migrateSeedSpotsToFirestore((done, total) => onProgress?.(1, done, total));
  await migrateUserSpotsToFirestore();
  await migrateReviewsToFirestore(anonymousUserId);

  console.log('=== 移行完了 ===');
}
