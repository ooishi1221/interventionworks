/**
 * Firestore データ型定義 — Moto-Logos Admin
 * モバイルアプリの firestoreTypes.ts をベースに、管理機能用の型を追加
 */

// ─────────────────────────────────────────────────────
// 共通 Enum / Union
// ─────────────────────────────────────────────────────

export type SpotStatus = 'active' | 'pending' | 'closed';
export type VerificationLevel = 'official' | 'trusted' | 'community';
export type UserRank = 'novice' | 'rider' | 'patrol';
export type ValidationType = 'good' | 'bad';
export type AdminRole = 'super_admin' | 'moderator' | 'viewer';
export type ReportReason = 'spam' | 'inappropriate' | 'misleading' | 'other';
export type ReportStatus = 'open' | 'resolved' | 'dismissed';

// ─────────────────────────────────────────────────────
// spots コレクション
// ─────────────────────────────────────────────────────

export interface SpotCapacity {
  is50only: boolean;
  upTo125: boolean;
  upTo400: boolean;
  isLargeOk: boolean;
}

export interface SpotPayment {
  cash: boolean;
  icCard: boolean;
  qrCode: boolean;
}

export interface FirestoreSpot {
  name: string;
  coordinate: { latitude: number; longitude: number };
  geohash: string;
  address?: string;
  capacity: SpotCapacity;
  parkingCapacity?: number;
  payment: SpotPayment;
  isFree: boolean;
  pricePerHour?: number;
  openHours?: string;
  viewCount: number;
  goodCount: number;
  badReportCount: number;
  status: SpotStatus;
  verificationLevel: VerificationLevel;
  source: 'seed' | 'user';
  createdBy?: string;
  updatedAt: FirebaseFirestore.Timestamp;
  lastVerifiedAt: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
}

// ─────────────────────────────────────────────────────
// users コレクション
// ─────────────────────────────────────────────────────

export type BanStatus = 'active' | 'suspended' | 'banned';

export interface FirestoreUser {
  displayName: string;
  trustScore: number;
  rank: UserRank;
  photoUrl?: string;
  banStatus?: BanStatus;
  banReason?: string;
  bannedAt?: FirebaseFirestore.Timestamp;
  banUntil?: FirebaseFirestore.Timestamp | null; // null = permanent
  bannedBy?: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

// ─────────────────────────────────────────────────────
// reviews コレクション
// ─────────────────────────────────────────────────────

export interface FirestoreReview {
  spotId: string;
  userId: string;
  score: number;
  comment?: string;
  photoUrls: string[];
  goodCount: number;
  badCount: number;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

// ─────────────────────────────────────────────────────
// reports コレクション（通報）
// ─────────────────────────────────────────────────────

export interface FirestoreReport {
  reviewId: string;
  spotId: string;
  reporterUid: string;
  reason: ReportReason;
  description?: string;
  status: ReportStatus;
  resolvedBy?: string;
  resolution?: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

// ─────────────────────────────────────────────────────
// moderation_logs コレクション（新規）
// ─────────────────────────────────────────────────────

export interface ModerationLog {
  adminId: string;
  adminEmail: string;
  action: string;
  targetType: 'spot' | 'user' | 'review' | 'admin';
  targetId: string;
  reason?: string;
  previousState: Record<string, unknown>;
  newState: Record<string, unknown>;
  createdAt: FirebaseFirestore.Timestamp;
}

// ─────────────────────────────────────────────────────
// コレクションパス定数
// ─────────────────────────────────────────────────────

export const COLLECTIONS = {
  SPOTS: 'spots',
  USERS: 'users',
  REVIEWS: 'reviews',
  VALIDATIONS: 'validations',
  REPORTS: 'reports',
  MODERATION_LOGS: 'moderation_logs',
  USER_ACTIVITY: 'user_activity',
  PUSH_TOKENS: 'push_tokens',
} as const;

// ─────────────────────────────────────────────────────
// API レスポンス用 (Timestamp → string 変換済み)
// ─────────────────────────────────────────────────────

export interface SpotResponse {
  id: string;
  name: string;
  address?: string;
  status: SpotStatus;
  verificationLevel: VerificationLevel;
  source: 'seed' | 'user';
  goodCount: number;
  badReportCount: number;
  viewCount: number;
  isFree: boolean;
  pricePerHour?: number;
  updatedAt: string;
  createdAt: string;
}

export interface UserResponse {
  id: string;
  displayName: string;
  trustScore: number;
  rank: UserRank;
  banStatus?: BanStatus;
  banReason?: string;
  bannedAt?: string;
  banUntil?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModerationLogResponse {
  id: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string;
  previousState: Record<string, unknown>;
  newState: Record<string, unknown>;
  createdAt: string;
}

export interface ReportResponse {
  id: string;
  reviewId: string;
  spotId: string;
  reporterUid: string;
  reason: ReportReason;
  description?: string;
  status: ReportStatus;
  resolvedBy?: string;
  resolution?: string;
  createdAt: string;
  updatedAt: string;
  // joined review data
  review?: {
    id: string;
    score: number;
    comment?: string;
    userId: string;
    spotId: string;
  };
  // joined spot name
  spotName?: string;
}

export interface DashboardStats {
  totalSpots: number;
  totalUsers: number;
  pendingSpots: number;
  totalReviews: number;
}

export interface KpiStats {
  dau: number;
  wau: number;
  mau: number;
  /** 過去30日間の日別アクティブユーザー数 [{date, count}] */
  dailyTrend: { date: string; count: number }[];

  /** DAU/MAU 比率 (0-100) */
  stickiness: number;

  /** リテンション率 (%) */
  retention: { d1: number; d7: number; d30: number };

  /** 日次新規スポット投稿率: 本日の新規スポット数 / DAU (%) */
  postingRate: number;

  /** 日次検証率: 本日の Good/Bad 投票数 / DAU (%) */
  verificationRate: number;

  /** スポット鮮度分布 */
  freshness: { fresh: number; stale: number; critical: number };

  /** ランク分布 */
  rankDistribution: { novice: number; rider: number; patrol: number };

  /** モデレーション平均処理日数 */
  moderationAvgDays: number;

  /** エリア別スポット数 Top 10 */
  topAreas: { area: string; count: number }[];

  /** セッション指標（未実装） */
  sessionMetrics: null;
}

// ─────────────────────────────────────────────────────
// 認証
// ─────────────────────────────────────────────────────

export interface AdminClaims {
  role: AdminRole;
}

export interface SessionUser {
  uid: string;
  email: string;
  role: AdminRole;
}
