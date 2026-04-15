/**
 * Firestore CRUD サービス — Moto-Logos v2 (Geohash 対応)
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
  writeBatch,
  Timestamp,
  GeoPoint,
  type DocumentData,
} from 'firebase/firestore';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './config';
import { COLLECTIONS } from './firestoreTypes';
import type { SpotCapacity, PhotoTag, HazardType, TheftAlertStatus } from './firestoreTypes';
import type { ParkingPin, Review, ReviewSummary, MaxCC } from '../types';
import { encodeGeohash, geohashQueryBounds } from '../utils/geohash';
import { isNgWord } from '../utils/ng-filter';
import { uploadReviewPhoto } from '../utils/image-upload';
import { captureError } from '../utils/sentry';

// ─────────────────────────────────────────────────────
// ユーザードキュメント管理
// ─────────────────────────────────────────────────────

/**
 * Firestore `users` コレクションにプロフィールを作成 or 取得。
 * 既存ドキュメントがあればそのまま返す。
 */
export async function ensureUserDocument(
  userId: string,
  displayName: string
): Promise<void> {
  const { getDoc } = await import('firebase/firestore');
  const ref = doc(db, COLLECTIONS.USERS, userId);
  const snap = await getDoc(ref);

  if (snap.exists()) return;

  // 新規ユーザー作成
  const now = Timestamp.now();
  await setDoc(ref, {
    displayName,
    createdAt: now,
    updatedAt: now,
  });
}

// ─────────────────────────────────────────────────────
// バイク情報をFirestoreに同期
// ─────────────────────────────────────────────────────

export async function syncBikeToFirestore(
  userId: string,
  bike: { name: string; manufacturer?: string; model?: string; year?: number; cc?: number | null; color?: string; photoUrl?: string; tagline?: string }
): Promise<void> {
  const { updateDoc } = await import('firebase/firestore');
  const ref = doc(db, COLLECTIONS.USERS, userId);
  await updateDoc(ref, {
    bike: stripUndef({
      name: bike.name,
      manufacturer: bike.manufacturer,
      model: bike.model,
      year: bike.year,
      cc: bike.cc,
      color: bike.color,
      photoUrl: bike.photoUrl,
      tagline: bike.tagline,
    }),
    updatedAt: Timestamp.now(),
  });
}

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

/** 24時間（ミリ秒） — currentParked の自動期限切れ閾値 */
const PARKED_EXPIRY_MS = 24 * 60 * 60 * 1000;

function docToPin(d: { id: string; data: () => Record<string, unknown> }): ParkingPin {
  const data = d.data();

  // currentParked: 24h以上更新がなければ 0 とみなす
  let currentParked: number | undefined;
  const rawParked = (data.currentParked as number | undefined) ?? 0;
  if (rawParked > 0) {
    const parkedAt = data.currentParkedAt as Timestamp | undefined;
    if (parkedAt && Date.now() - parkedAt.toDate().getTime() < PARKED_EXPIRY_MS) {
      currentParked = rawParked;
    }
    // 24h超過 → undefined（0扱い）
  }

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
    priceInfo:    data.priceInfo,
    openHours:    data.openHours,
    paymentCash:  data.payment?.cash,
    paymentIC:    data.payment?.icCard,
    paymentQR:    data.payment?.qrCode,
    updatedAt:    (data.updatedAt as Timestamp | undefined)?.toDate().toISOString(),
    currentParked,
    lastArrivedAt: (data.currentParkedAt as Timestamp | undefined)?.toDate().toISOString(),
    isGuerrilla:  (data.isGuerrilla as boolean | undefined) ?? undefined,
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

    return results;
  } catch (e) {
    captureError(e, { context: 'geohash_query_failed' });
    // geohash インデックス未作成時のみ全件取得にフォールバック
    return fetchAllSpots();
  }
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
    address?: string; maxCC: MaxCC; isFree: boolean | null;
    capacity?: number; pricePerHour?: number; openHours?: string;
  },
): Promise<void> {
  // NG ワードチェック（クライアント側即時フィードバック）
  if (isNgWord(spot.name)) {
    throw new Error('スポット名に不適切な表現が含まれています');
  }

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
    payment: { cash: spot.isFree === false, icCard: false, qrCode: false },
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
// スポット詳細カウント取得
// ─────────────────────────────────────────────────────

export async function fetchSpotCounts(spotId: string): Promise<{ goodCount: number; badReportCount: number }> {
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(db, COLLECTIONS.SPOTS, spotId));
  if (!snap.exists()) return { goodCount: 0, badReportCount: 0 };
  const data = snap.data();
  return {
    goodCount: (data.goodCount as number) ?? 0,
    badReportCount: (data.badReportCount as number) ?? 0,
  };
}

// ─────────────────────────────────────────────────────
// viewCount インクリメント（スポット詳細を開いた時）
// ─────────────────────────────────────────────────────

export async function incrementViewCount(spotId: string): Promise<void> {
  const { updateDoc, increment } = await import('firebase/firestore');
  try {
    await updateDoc(doc(db, COLLECTIONS.SPOTS, spotId), { viewCount: increment(1) });
  } catch (e) { captureError(e, { context: 'viewCount_increment', spotId }); }
}

// ─────────────────────────────────────────────────────
// 自分が登録したスポットの合計閲覧数を取得
// ─────────────────────────────────────────────────────

export async function getMySpotsTotalViews(localSpotIds: string[]): Promise<number> {
  if (localSpotIds.length === 0) return 0;
  const { getDoc } = await import('firebase/firestore');
  const results = await Promise.all(
    localSpotIds.map((id) =>
      getDoc(doc(db, COLLECTIONS.SPOTS, id))
        .then((snap) => (snap.exists() ? ((snap.data().viewCount as number) ?? 0) : 0))
        .catch((e) => { captureError(e, { context: 'spot_views_fetch', spotId: id }); return 0; })
    )
  );
  return results.reduce((sum, v) => sum + v, 0);
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

export async function reportSpotFull(spotId: string): Promise<void> {
  const ref = doc(db, COLLECTIONS.SPOTS, spotId);
  const { updateDoc, increment } = await import('firebase/firestore');
  await updateDoc(ref, {
    badReportCount: increment(1),
    lastVerifiedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

export async function reportSpotClosed(spotId: string): Promise<void> {
  const ref = doc(db, COLLECTIONS.SPOTS, spotId);
  const { updateDoc, increment } = await import('firebase/firestore');
  await updateDoc(ref, {
    badReportCount: increment(3),
    status: 'pending',
    lastVerifiedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

// ─────────────────────────────────────────────────────
// リアルタイム空き状況 — 「今ここに停めた / 出た」(#79)
// ─────────────────────────────────────────────────────

/**
 * 「停めた」→ currentParked を +1 し、タイムスタンプを更新。
 * カウンターは概算で構わない。
 */
export async function reportParked(spotId: string): Promise<void> {
  const { updateDoc, increment } = await import('firebase/firestore');
  await updateDoc(doc(db, COLLECTIONS.SPOTS, spotId), {
    currentParked: increment(1),
    currentParkedAt: Timestamp.now(),
  });
}

/**
 * 「出発した」→ currentParked を -1（最小 0）。
 * Firestore の increment(-1) は 0 以下になり得るため、
 * 読み取り側（docToPin）で 0 未満をカットしている。
 */
export async function reportDeparted(spotId: string): Promise<void> {
  const { updateDoc, increment } = await import('firebase/firestore');
  await updateDoc(doc(db, COLLECTIONS.SPOTS, spotId), {
    currentParked: increment(-1),
    currentParkedAt: Timestamp.now(),
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
    where('spotId', '==', spotId),
    limit(30)
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
      vehicleName: (data.vehicleName as string) ?? null,
      photoTag:    (data.photoTag as string | undefined) as Review['photoTag'] ?? null,
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
  userId: string,
  score: number,
  comment?: string,
  photoUri?: string,
  onUploadProgress?: (progress: number) => void,
  vehicleName?: string,
  photoTag?: PhotoTag,
): Promise<void> {
  // NG ワードチェック（クライアント側即時フィードバック）
  if (comment && isNgWord(comment)) {
    throw new Error('レビューに不適切な表現が含まれています');
  }

  // 写真がある場合は Firebase Storage にアップロード
  let photoUrls: string[] = [];
  if (photoUri) {
    const url = await uploadReviewPhoto(photoUri, userId, spotId, onUploadProgress);
    photoUrls = [url];
  }

  const now = Timestamp.now();
  await addDoc(collection(db, COLLECTIONS.REVIEWS), stripUndef({
    spotId,
    userId,
    score,
    ...(comment  != null && comment !== '' && { comment }),
    ...(vehicleName && { vehicleName }),
    photoUrls,
    ...(photoTag && { photoTag }),
    goodCount: 0,
    badCount:  0,
    createdAt: now,
    updatedAt: now,
  }));
}

/** 自分の口コミを全件取得（spotName 付き） */
export async function fetchMyReviews(userId: string): Promise<(Review & { spotName: string })[]> {
  const q = query(
    collection(db, COLLECTIONS.REVIEWS),
    where('userId', '==', userId)
  );
  const snap = await getDocs(q);

  // スポット名解決用: レビューに紐づくスポットだけバッチ取得（全件スキャン回避）
  const spotIds = [...new Set(snap.docs.map((d) => d.data().spotId as string))];
  const nameMap = new Map<string, string>();
  // Firestore in クエリは10件制限のためチャンク分割
  for (let i = 0; i < spotIds.length; i += 10) {
    const chunk = spotIds.slice(i, i + 10);
    const { documentId } = await import('firebase/firestore');
    const spotsSnap = await getDocs(query(collection(db, COLLECTIONS.SPOTS), where(documentId(), 'in', chunk)));
    for (const d of spotsSnap.docs) nameMap.set(d.id, d.data().name ?? d.id);
  }

  const results = snap.docs.map((d) => {
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
      spotName:    nameMap.get(data.spotId as string) ?? (data.spotId as string),
    };
  });
  results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return results;
}

export async function deleteReviewFromFirestore(firestoreId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.REVIEWS, firestoreId));
}

/** 指定ユーザーの投稿レビュー件数を返す */
export async function getMyReviewCount(userId: string): Promise<number> {
  const q = query(
    collection(db, COLLECTIONS.REVIEWS),
    where('userId', '==', userId)
  );
  const snap = await getDocs(q);
  return snap.size;
}

// ─────────────────────────────────────────────────────
// DAU/WAU/MAU — 日次アクティビティ記録
// ─────────────────────────────────────────────────────

const DEVICE_ID_KEY = 'moto_logos_device_id';

async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    // crypto.randomUUID 非対応環境フォールバック
    id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/**
 * アプリ起動時に 1日1回 Firestore へアクティビティを記録。
 * DAU/WAU/MAU の集計元データになる。
 */
export async function logActivity(): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const docId = `${deviceId}_${today}`;

    await setDoc(doc(db, COLLECTIONS.USER_ACTIVITY, docId), {
      deviceId,
      date: today,
      platform: Platform.OS,
      lastActiveAt: Timestamp.now(),
    });
  } catch (e) {
    captureError(e, { context: 'log_activity' });
  }
}

// ─────────────────────────────────────────────────────
// テストデータ全削除（開発者ツール用）
// ─────────────────────────────────────────────────────

/**
 * 自分が作ったスポット（source: 'user'）と
 * 自分が書いたレビューをFirestoreから一括削除する。
 * マップデータ（osm_, jmpsa_, real_）は残す。
 */
export async function purgeTestData(): Promise<{ spots: number; reviews: number }> {
  const deviceId = await getDeviceId();
  let spotCount = 0;
  let reviewCount = 0;

  // --- ユーザー作成スポットを削除 ---
  const spotsQ = query(
    collection(db, COLLECTIONS.SPOTS),
    where('source', '==', 'user'),
  );
  const spotsSnap = await getDocs(spotsQ);

  for (let i = 0; i < spotsSnap.docs.length; i += 499) {
    const batch = writeBatch(db);
    const chunk = spotsSnap.docs.slice(i, i + 499);
    for (const d of chunk) batch.delete(d.ref);
    await batch.commit();
    spotCount += chunk.length;
  }

  // --- 自分のレビューを削除 ---
  const reviewsQ = query(
    collection(db, COLLECTIONS.REVIEWS),
    where('userId', '==', deviceId),
  );
  const reviewsSnap = await getDocs(reviewsQ);

  for (let i = 0; i < reviewsSnap.docs.length; i += 499) {
    const batch = writeBatch(db);
    const chunk = reviewsSnap.docs.slice(i, i + 499);
    for (const d of chunk) batch.delete(d.ref);
    await batch.commit();
    reviewCount += chunk.length;
  }

  return { spots: spotCount, reviews: reviewCount };
}
