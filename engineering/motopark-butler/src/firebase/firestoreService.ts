/**
 * Firestore CRUD サービス — Moto-Spotter
 * アプリ内の全クラウドアクセスはこのファイル経由で行う。
 */

import {
  collection,
  getDocs,
  addDoc,
  setDoc,
  deleteDoc,
  doc,
  query,
  where,
  Timestamp,
  GeoPoint,
} from 'firebase/firestore';
import { db } from './config';
import { COLLECTIONS } from './firestoreTypes';
import type { SpotCapacity } from './firestoreTypes';
import type { ParkingPin, Review, ReviewSummary, MaxCC } from '../types';

// ─────────────────────────────────────────────────────
// 変換ヘルパー
// ─────────────────────────────────────────────────────

/** SpotCapacity フラグ → MaxCC */
function capacityToMaxCC(c: SpotCapacity): MaxCC {
  if (c.isLargeOk) return null;
  if (c.upTo400)   return 250;
  if (c.upTo125)   return 125;
  return 50;
}

/** undefined フィールドを除去（Firestore は undefined 不可） */
function stripUndef<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

// ─────────────────────────────────────────────────────
// スポット
// ─────────────────────────────────────────────────────

/** Firestore の spots コレクション全件を ParkingPin[] として取得 */
export async function fetchAllSpots(): Promise<ParkingPin[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.SPOTS));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id:           d.id,
      name:         data.name,
      latitude:     (data.coordinate as GeoPoint).latitude,
      longitude:    (data.coordinate as GeoPoint).longitude,
      maxCC:        capacityToMaxCC(data.capacity as SpotCapacity),
      isFree:       data.isFree,
      capacity:     data.parkingCapacity ?? null,
      source:       data.source as 'seed' | 'user',
      address:      data.address,
      pricePerHour: data.pricePerHour,
      openHours:    data.openHours,
    } as ParkingPin;
  });
}

/**
 * ユーザースポットを Firestore に登録する。
 * SQLite の localId を使って "user_{localId}" ドキュメントIDを固定。
 */
export async function addUserSpotToFirestore(
  localId: number,
  spot: {
    name: string; latitude: number; longitude: number;
    address?: string; maxCC: MaxCC; isFree: boolean;
    capacity?: number; pricePerHour?: number; openHours?: string;
  }
): Promise<void> {
  const now = Timestamp.now();
  const data = stripUndef({
    name:       spot.name,
    coordinate: new GeoPoint(spot.latitude, spot.longitude),
    ...(spot.address      != null && { address:         spot.address }),
    capacity: {
      is50only:  spot.maxCC === 50,
      upTo125:   spot.maxCC === 125,
      upTo400:   spot.maxCC === 250,
      isLargeOk: spot.maxCC === null,
    },
    ...(spot.capacity     != null && { parkingCapacity: spot.capacity }),
    payment: { cash: !spot.isFree, icCard: false, qrCode: false },
    isFree:    spot.isFree,
    ...(spot.pricePerHour != null && { pricePerHour:    spot.pricePerHour }),
    ...(spot.openHours    != null && { openHours:       spot.openHours }),
    viewCount: 0, goodCount: 0, badReportCount: 0,
    status: 'active', verificationLevel: 'community', source: 'user',
    updatedAt: now, lastVerifiedAt: now, createdAt: now,
  });
  await setDoc(doc(db, COLLECTIONS.SPOTS, `user_${localId}`), data);
}

/** ユーザースポットを Firestore から削除する */
export async function deleteUserSpotFromFirestore(localId: number): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.SPOTS, `user_${localId}`));
}

// ─────────────────────────────────────────────────────
// レビュー
// ─────────────────────────────────────────────────────

/** 指定スポットのレビュー一覧を Firestore から取得 */
export async function fetchReviews(
  spotId: string,
  sortBy: 'date' | 'score' = 'date'
): Promise<Review[]> {
  const q = query(
    collection(db, COLLECTIONS.REVIEWS),
    where('spotId', '==', spotId)
  );
  const snap = await getDocs(q);

  const reviews: Review[] = snap.docs.map((d) => {
    const data = d.data();
    const ts = data.createdAt as Timestamp | undefined;
    return {
      id:          0,
      firestoreId: d.id,
      spotId:      data.spotId as string,
      source:      'seed' as const,
      score:       data.score as number,
      comment:     (data.comment as string) ?? null,
      photoUri:    (data.photoUrls as string[])?.[0] ?? null,
      createdAt:   ts?.toDate().toISOString() ?? new Date().toISOString(),
    };
  });

  if (sortBy === 'score') {
    reviews.sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt));
  } else {
    reviews.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return reviews;
}

/** 指定スポットのレビューサマリーをクライアント集計で返す */
export async function fetchReviewSummary(spotId: string): Promise<ReviewSummary | null> {
  const reviews = await fetchReviews(spotId);
  if (reviews.length === 0) return null;
  const avg = reviews.reduce((s, r) => s + r.score, 0) / reviews.length;
  return { avg: Math.round(avg * 10) / 10, count: reviews.length };
}

/** レビューを Firestore に投稿する */
export async function addReview(
  spotId: string,
  score: number,
  comment?: string,
  photoUri?: string
): Promise<void> {
  const now = Timestamp.now();
  await addDoc(collection(db, COLLECTIONS.REVIEWS), stripUndef({
    spotId,
    userId:    'local_user',
    score,
    ...(comment  != null && comment !== '' && { comment }),
    photoUrls: photoUri ? [photoUri] : [],
    goodCount: 0,
    badCount:  0,
    createdAt: now,
    updatedAt: now,
  }));
}

/** Firestore からレビューを削除する */
export async function deleteReviewFromFirestore(firestoreId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.REVIEWS, firestoreId));
}
