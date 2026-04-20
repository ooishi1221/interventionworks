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
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, getFirebaseAuth } from './config';
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

function docToPin(d: { id: string; data: () => Record<string, unknown> }): ParkingPin {
  const data = d.data();
  const payment = data.payment as { cash?: boolean; icCard?: boolean; qrCode?: boolean } | undefined;

  return {
    id:           d.id,
    name:         data.name as string,
    latitude:     (data.coordinate as GeoPoint).latitude,
    longitude:    (data.coordinate as GeoPoint).longitude,
    maxCC:        capacityToMaxCC(data.capacity as SpotCapacity),
    isFree:       (data.isFree as boolean | null) ?? null,
    capacity:     (data.parkingCapacity as number | undefined) ?? null,
    source:       data.source as 'seed' | 'user',
    address:      data.address as string | undefined,
    pricePerHour: data.pricePerHour as number | undefined,
    priceInfo:    data.priceInfo as string | undefined,
    openHours:    data.openHours as string | undefined,
    paymentCash:  payment?.cash,
    paymentIC:    payment?.icCard,
    paymentQR:    payment?.qrCode,
    updatedAt:    (data.updatedAt as Timestamp | undefined)?.toDate().toISOString(),
    lastConfirmedAt: (data.lastVerifiedAt as Timestamp | undefined)?.toDate().toISOString(),
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
  maxResults = 200
): Promise<ParkingPin[]> {
  const bounds = geohashQueryBounds(region);
  const spotsCol = collection(db, COLLECTIONS.SPOTS);

  const runQueries = async (): Promise<ParkingPin[]> => {
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
  };

  try {
    return await runQueries();
  } catch (e: unknown) {
    // 初回サインイン直後は ID Token が Firestore backend に反映されるまで
    // 数百ms のラグがあり permission-denied が発生しやすい。
    // トークンをリフレッシュしてから1度だけリトライする。
    const msg = e instanceof Error ? e.message : String(e);
    const code = (e as { code?: string })?.code ?? '';
    const isAuthIssue = code === 'permission-denied' || /permission|unauth/i.test(msg);

    if (isAuthIssue) {
      try {
        const auth = getFirebaseAuth();
        if (auth.currentUser) {
          await auth.currentUser.getIdToken(true);
          await new Promise((r) => setTimeout(r, 500));
          return await runQueries();
        }
      } catch (e2) {
        captureError(e2, { context: 'geohash_query_retry_failed' });
      }
    }

    captureError(e, { context: 'geohash_query_failed' });
    if (__DEV__) {
      Alert.alert('Firestore エラー', `geohash query: ${msg}`);
    }
    // geohash インデックス未作成時のみ全件取得にフォールバック
    return fetchAllSpots();
  }
}

/**
 * 後方互換: 全件取得（マイグレーション期間中のみ使用）
 * geohash フィールドがないスポットも取得できる。
 */
export async function fetchAllSpots(): Promise<ParkingPin[]> {
  const snap = await getDocs(query(collection(db, COLLECTIONS.SPOTS), limit(5000)));
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
    createdBy: getFirebaseAuth().currentUser?.uid ?? '',
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
  const { getDocs: gd, query: q, where: w, documentId } = await import('firebase/firestore');
  let total = 0;
  // Firestore 'in' は最大10件 → チャンク分割
  for (let i = 0; i < localSpotIds.length; i += 10) {
    const chunk = localSpotIds.slice(i, i + 10);
    try {
      const snap = await gd(q(collection(db, COLLECTIONS.SPOTS), w(documentId(), 'in', chunk)));
      for (const d of snap.docs) {
        total += ((d.data().viewCount as number) ?? 0);
      }
    } catch (e) {
      captureError(e, { context: 'spot_views_batch', chunk: chunk.join(',') });
    }
  }
  return total;
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
// 鮮度更新 — ワンショット撮影の副産物
// ─────────────────────────────────────────────────────

/** ワンショット撮影時に鮮度（lastVerifiedAt）を更新する */
export async function reportParked(spotId: string): Promise<void> {
  const { updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, COLLECTIONS.SPOTS, spotId), {
    lastVerifiedAt: Timestamp.now(),
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
      userId:      (data.userId as string) ?? null,
      source:      'seed' as const,
      score:       data.score as number,
      comment:     (data.comment as string) ?? null,
      photoUri:    (data.photoUrls as string[])?.[0] ?? null,
      vehicleName: (data.vehicleName as string) ?? null,
      nickname:    (data.nickname as string) ?? null,
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

/** ユーザーの写真付きレビューを取得（自分のノート用） */
export async function fetchUserPhotos(userId: string): Promise<Review[]> {
  // composite index (userId + createdAt) がない場合に備え、orderByなしでクエリ
  const q = query(
    collection(db, COLLECTIONS.REVIEWS),
    where('userId', '==', userId),
    limit(100),
  );
  const snap = await getDocs(q);
  const results = snap.docs
    .map((d) => {
      const data = d.data();
      const urls = data.photoUrls as string[] | undefined;
      if (!urls?.length) return null;
      const ts = data.createdAt as Timestamp | undefined;
      return {
        id:          0,
        firestoreId: d.id,
        spotId:      data.spotId as string,
        userId:      userId,
        source:      'seed' as const,
        score:       data.score as number,
        comment:     (data.comment as string) ?? null,
        photoUri:    urls[0],
        vehicleName: (data.vehicleName as string) ?? null,
      nickname:    (data.nickname as string) ?? null,
        photoTag:    (data.photoTag as string | undefined) as Review['photoTag'] ?? null,
        mapUpdateStatus: (data.mapUpdateStatus as Review['mapUpdateStatus']) ?? undefined,
        mapUpdateAnalysis: (data.mapUpdateAnalysis as Review['mapUpdateAnalysis']) ?? undefined,
        createdAt:   ts?.toDate().toISOString() ?? new Date().toISOString(),
      } satisfies Review;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null) as Review[];
  // クライアント側で日付降順ソート
  results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return results.slice(0, 50);
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
  nickname?: string,
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
    ...(nickname && { nickname }),
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

/**
 * 現在の認証済み userId を返す。
 * UserContext 経由ではなく直接 auth.uid を取得する内部ヘルパー。
 * auth 未初期化時は AsyncStorage の deviceId にフォールバック。
 */
async function getCurrentUserId(): Promise<string> {
  const auth = getFirebaseAuth();
  if (auth.currentUser) return auth.currentUser.uid;
  // フォールバック: auth 未初期化（起動直後の競合状態）
  const deviceId = await AsyncStorage.getItem('moto_logos_device_id');
  if (deviceId) return deviceId;
  throw new Error('userId が取得できません');
}

/**
 * アプリ起動時に 1日1回 Firestore へアクティビティを記録。
 * DAU/WAU/MAU の集計元データになる。
 */
export async function logActivity(): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const docId = `${userId}_${today}`;

    await setDoc(doc(db, COLLECTIONS.USER_ACTIVITY, docId), {
      userId,
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
  const userId = await getCurrentUserId();
  let spotCount = 0;
  let reviewCount = 0;

  // --- 自分が作成したスポットを削除 ---
  const spotsQ = query(
    collection(db, COLLECTIONS.SPOTS),
    where('source', '==', 'user'),
    where('createdBy', '==', userId),
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
    where('userId', '==', userId),
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
