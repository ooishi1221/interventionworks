/**
 * Firestore データ型定義 — Moto-Logos Admin
 * モバイルアプリの firestoreTypes.ts をベースに、管理機能用の型を追加
 */

// ─────────────────────────────────────────────────────
// 共通 Enum / Union
// ─────────────────────────────────────────────────────

export type SpotStatus = 'active' | 'pending' | 'closed';
export type VerificationLevel = 'official' | 'trusted' | 'community';
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

export type PhotoModerationStatus = 'pending' | 'approved' | 'rejected';
export type PhotoTag = 'sign' | 'entrance' | 'general';
export type MapUpdateStatus = 'pending' | 'analyzed' | 'applied' | 'skipped';

export interface GeminiAnalysisResult {
  priceInfo?: string;
  openHours?: string;
  parkingCapacity?: number;
  isFree?: boolean;
  payment?: { cash: boolean; icCard: boolean; qrCode: boolean };
  capacity?: { is50only: boolean; upTo125: boolean; upTo400: boolean; isLargeOk: boolean };
  confidence: number;
}

export interface FirestoreReview {
  spotId: string;
  userId: string;
  score: number;
  comment?: string;
  photoUrls: string[];
  photoTag?: PhotoTag;
  goodCount: number;
  badCount: number;
  /** 写真モデレーションステータス（photoUrls が空でないレビューのみ） */
  photoModeration?: PhotoModerationStatus;
  photoModeratedAt?: FirebaseFirestore.Timestamp;
  photoModeratedBy?: string;
  /** 地図更新ステータス */
  mapUpdateStatus?: MapUpdateStatus;
  mapUpdateAnalysis?: GeminiAnalysisResult;
  mapUpdateAnalyzedBy?: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface MapUpdateReviewResponse {
  reviewId: string;
  spotId: string;
  spotName: string;
  userId: string;
  photoUrls: string[];
  photoTag?: PhotoTag;
  comment?: string;
  score: number;
  mapUpdateStatus: MapUpdateStatus;
  mapUpdateAnalysis?: GeminiAnalysisResult;
  createdAt: string;
  currentSpot?: {
    priceInfo?: string;
    openHours?: string;
    parkingCapacity?: number;
    isFree?: boolean;
    payment?: SpotPayment;
    capacity?: SpotCapacity;
  };
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
// beta_signups コレクション（事前登録）
// ─────────────────────────────────────────────────────

export type InvitationStatus = 'pending' | 'invited' | 'active';
export type BetaSignupOS = 'ios' | 'android';

export interface FirestoreBetaSignup {
  email: string;
  source: string;
  os?: BetaSignupOS;
  invitationStatus?: InvitationStatus;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface BetaSignupResponse {
  id: string;
  email: string;
  source: string;
  os?: BetaSignupOS;
  invitationStatus: InvitationStatus;
  createdAt: string;
}

// ─────────────────────────────────────────────────────
// beta_feedback コレクション（βフィードバック）
// ─────────────────────────────────────────────────────

export type BetaFeedbackType = 'bug' | 'opinion' | 'confused';
export type BetaFeedbackStatus = 'open' | 'in_progress' | 'resolved';

export interface FirestoreBetaFeedback {
  userId: string;
  message: string;
  feedbackType: BetaFeedbackType;
  photoUrl?: string;
  deviceModel: string;
  os: string;
  osVersion: string;
  appVersion: string;
  status?: BetaFeedbackStatus;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface BetaFeedbackResponse {
  id: string;
  userId: string;
  message: string;
  feedbackType: BetaFeedbackType;
  photoUrl?: string;
  deviceModel: string;
  os: string;
  osVersion: string;
  appVersion: string;
  status: BetaFeedbackStatus;
  createdAt: string;
}

// ─────────────────────────────────────────────────────
// beta_errors コレクション（βエラー）
// ─────────────────────────────────────────────────────

export type BetaErrorStatus = 'open' | 'known' | 'in_progress' | 'fixed';

export interface FirestoreBetaError {
  message: string;
  context?: string;
  userId?: string;
  deviceModel: string;
  os: string;
  osVersion: string;
  appVersion: string;
  stack?: string;
  status?: BetaErrorStatus;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface BetaErrorResponse {
  id: string;
  message: string;
  context?: string;
  userId?: string;
  deviceModel: string;
  os: string;
  osVersion: string;
  appVersion: string;
  stack?: string;
  status: BetaErrorStatus;
  createdAt: string;
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
  NOTIFICATION_TEMPLATES: 'notification_templates',
  SCHEDULED_NOTIFICATIONS: 'scheduled_notifications',
  BETA_SIGNUPS: 'beta_signups',
  BETA_FEEDBACK: 'beta_feedback',
  BETA_ERRORS: 'beta_errors',
  DEBUG_REPORTS: 'debug_reports',
} as const;

// ─────────────────────────────────────────────────────
// Debug Report — 設定画面の「デバッグ情報を送信」ボタンで書き込まれる
// ─────────────────────────────────────────────────────

export interface DebugReportRecentError {
  ts: string;
  context: string;
  message: string;
}

export interface DebugReportResponse {
  id: string;
  userId: string;
  authUid: string | null;
  platform: string;
  osVersion: string;
  deviceModel: string;
  deviceBrand: string;
  appVersion: string;
  buildNumber: string | number | null;
  updateId: string;
  runtimeVersion: string;
  channel: string;
  recentErrors: DebugReportRecentError[];
  userNote?: string;
  createdAt: string;
}

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
  priceInfo?: string;
  openHours?: string;
  parkingCapacity?: number;
  payment?: { cash: boolean; icCard: boolean; qrCode: boolean };
  updatedAt: string;
  createdAt: string;
}

export interface UserResponse {
  id: string;
  displayName: string;
  banStatus?: BanStatus;
  banReason?: string;
  bannedAt?: string;
  banUntil?: string | null;
  createdAt: string;
  updatedAt: string;
  /** 最終ログイン（= 最終起動）日時 */
  lastActiveAt?: string;
  /** 累計起動回数 */
  launchCount?: number;
  /** 最終起動時の OS (ios / android / web) */
  lastPlatform?: string;
  /** 最終起動時の端末モデル名 */
  lastDeviceModel?: string;
  /** 最終起動時の端末ブランド */
  lastDeviceBrand?: string;
  /** 最終起動時の OS バージョン */
  lastOsVersion?: string;
  /** 最終起動時のアプリバージョン */
  lastAppVersion?: string;
  /** 累計スポット投稿数 */
  spotCount?: number;
  /** 累計写真投稿数 */
  photoCount?: number;
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

  /** 日次足跡率: 本日の新規スポット数 / DAU (%) */
  footprintRate: number;

  /** 日次検証率: 本日の Good/Bad 投票数 / DAU (%) */
  verificationRate: number;

  /** スポット鮮度分布 */
  freshness: { fresh: number; stale: number; critical: number };

  /** 駐車温度分布 */
  temperatureDistribution: { blazing: number; hot: number; warm: number; cool: number; cold: number };

  /** エリア別スポット数 Top 10 */
  topAreas: { area: string; count: number }[];

  /** レビュー投稿率: レビュー投稿ユーザー数 / 全ユーザー数 (%) */
  reviewRate: number;

  /** 写真添付率: 写真付きレビュー数 / 全レビュー数 (%) */
  photoAttachRate: number;

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
