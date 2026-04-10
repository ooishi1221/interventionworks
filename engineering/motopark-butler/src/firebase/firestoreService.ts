/**
 * Firestore CRUD サービス — Moto-Spotter v2 (Geohash 対応)
 *
 * - 全件取得を廃止 → geohash プレフィクスによる範囲検索
 * - 一度取得済みのエリアはオフラインキャッシュから即時返却
 * - ユーザースポット登録時に geohash を自動付与
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
  orderBy,
  limit,
  Timestamp,
  GeoPoint,
} from 'firebase/firestore';
import { db } from './config';
import { COLLECTIONS } from './firestoreTypes';
import type { SpotCapacity } from './firestoreTypes';
import type { ParkingPin, Review, ReviewSummary, MaxCC } from '../types';
import { encodeGeohash, geohashQueryBounds } from '../utils/geohash';

// ─────────────────────────────────────────────────────
// 変換ヘルパー
// ─────────────────────────────────────────────────────

function capacityToMaxCC(c: SpotCapacity): MaxCC {
  if (c.isLargeOk) return null;
  if (c.upTo400)   return 250;
  if (c.upTo125)   return 125;
  return 50;
}

function stripUndef<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

function docToPin(d: { id: string; data: () => any }): ParkingPin {
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
    updatedAt:    (data.updatedAt as Timestamp | undefined)?.toDate().toISOString(),
  };
}

// ─────────────────────────────────────────────────────
// スポット — geohash 範囲検索
// ─────────────────────────────────────────────────────

/**
 * MapView の可視範囲内のスポットだけを Firestore から取得する。
 *
 * geohash フィールドのプレフィクスクエリで対象を絞り、
 * Firestore の Read 数を劇的に削減する。
 * オフラインキャッシュ済みなら通信なしで即座に返る。
 *
 * @param region - MapView の表示領域 (lat, lon, delta)
 * @param maxResults - 1 クエリあたりの上限（デフォルト 500）
 */
export async function fetchSpotsInRegion(
  region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  },
  maxResults = 500
): Promise<ParkingPin[]> {
  const bounds = geohashQueryBounds(region);
  const spotsCol = collection(db, COLLECTIONS.SPOTS);

  try {
    // 各 geohash 範囲を並列クエリ
    const queries = bounds.map(([start, end]) =>
      getDocs(
        query(
          spotsCol,
          orderBy('geohash'),
          where('geohash', '>=', start),
          where('geohash', '<', end),
          limit(maxResults)
        )
      )
    );

    const snapshots = await Promise.all(queries);

    // 重複排除
    const seen = new Set<string>();
    const results: ParkingPin[] = [];
    for (const snap of snapshots) {
      for (const d of snap.docs) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        results.push(docToPin(d));
      }
    }

    // geohash 移行済みならそのまま返す
    if (results.length > 0) return results;
  } catch (e) {
    // geohash インデックス未作成の場合もフォールバック
    console.warn('[firestoreService] geohash query failed, falling back:', e);
  }

  // ── フォールバック: geohash 未移行 → 全件取得（マイグレーション後は geohash クエリが使われる） ──
  console.log('[firestoreService] geohash未検出 → 全件取得フォールバック');
  return fetchAllSpots();
}

/**
 * 後方互換: 全件取得（マイグレーション期間中のみ使用）
 * geohash フィールドがないスポットも取得できる。
 */
export async function fetchAllSpots(): Promise<ParkingPin[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.SPOTS));
  return snap.docs.map((d) => docToPin(d));
}

// ─────────────────────────────────────────────────────
// ユーザースポット登録（geohash 自動付与）
// ─────────────────────────────────────────────────────

export async function addUserSpotToFirestore(
  localId: number,
  spot: {
    name: string; latitude: number; longitude: number;
    address?: string; maxCC: MaxCC; isFree: boolean;
    capacity?: number; pricePerHour?: number; openHours?: string;
  }
): Promise<void> {
  const now = Timestamp.now();
  const geohash = encodeGeohash(spot.latitude, spot.longitude, 9);
  const data = stripUndef({
    name:       spot.name,
    coordinate: new GeoPoint(spot.latitude, spot.longitude),
    geohash,
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

export async function deleteUserSpotFromFirestore(localId: number): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.SPOTS, `user_${localId}`));
}

// ─────────────────────────────────────────────────────
// ステータス報告（👍停められた / 👎満車・閉鎖）
// ─────────────────────────────────────────────────────

export async function reportSpotGood(spotId: string): Promise<void> {
  const ref = doc(db, COLLECTIONS.SPOTS, spotId);
  const { updateDoc, increment } = await import('firebase/firestore');
  await updateDoc(ref, {
    goodCount: increment(1),
    lastVerifiedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

export async function reportSpotBad(spotId: string): Promise<void> {
  const ref = doc(db, COLLECTIONS.SPOTS, spotId);
  const { updateDoc, increment } = await import('firebase/firestore');
  await updateDoc(ref, {
    badReportCount: increment(1),
    lastVerifiedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

// ─────────────────────────────────────────────────────
// レビュー（変更なし — spotId 単位クエリのため geohash 不要）
// ─────────────────────────────────────────────────────

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

export async function fetchReviewSummary(spotId: string): Promise<ReviewSummary | null> {
  const reviews = await fetchReviews(spotId);
  if (reviews.length === 0) return null;
  const avg = reviews.reduce((s, r) => s + r.score, 0) / reviews.length;
  return { avg: Math.round(avg * 10) / 10, count: reviews.length };
}

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

export async function deleteReviewFromFirestore(firestoreId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.REVIEWS, firestoreId));
}
