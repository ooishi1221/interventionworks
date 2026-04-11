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

export interface FirestoreUser {
  displayName: string;
  trustScore: number;
  rank: UserRank;
  photoUrl?: string;
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
  MODERATION_LOGS: 'moderation_logs',
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

export interface DashboardStats {
  totalSpots: number;
  totalUsers: number;
  pendingSpots: number;
  totalReviews: number;
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
