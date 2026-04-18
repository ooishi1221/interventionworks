/**
 * Firestore データ型定義 — Moto-Logos v1.1
 * 仕様書 §4 "データ構造 (Firebase Firestore)" に準拠
 */
import { Timestamp, GeoPoint } from 'firebase/firestore';

// ─────────────────────────────────────────────────────
// 共通 Enum / Union
// ─────────────────────────────────────────────────────

/** スポットのステータス */
export type SpotStatus = 'active' | 'pending' | 'closed';

/** 情報の信頼レベル */
export type VerificationLevel = 'official' | 'trusted' | 'community';

/** Good/Bad 投票タイプ */
export type ValidationType = 'good' | 'bad';

/** 写真タグ（看板 / 入口 / その他） */
export type PhotoTag = 'sign' | 'entrance' | 'general';

/** ハザード（危険箇所）タイプ */
export type HazardType = 'slippery' | 'pothole' | 'narrow' | 'blind_spot' | 'other';

// ─────────────────────────────────────────────────────
// 排気量区分フラグ（capacity オブジェクト）
// ─────────────────────────────────────────────────────
/**
 * 各フラグは「その排気量区分を最大とする」ことを示す（排他的）。
 *
 *  is50only  = true → 原付一種（50cc以下）専用
 *  upTo125   = true → 原付二種まで（〜125cc）
 *  upTo400   = true → 普通二輪まで（〜400cc）
 *  isLargeOk = true → 大型二輪OK（制限なし）
 *
 * フィルタリングロジック:
 *  50cc ユーザー → 全スポット
 *  125cc ユーザー → upTo125 || upTo400 || isLargeOk
 *  400cc ユーザー → upTo400 || isLargeOk
 *  大型ユーザー  → isLargeOk のみ
 */
export interface SpotCapacity {
  is50only:   boolean;
  upTo125:    boolean;
  upTo400:    boolean;
  isLargeOk:  boolean;
}

// ─────────────────────────────────────────────────────
// 精算方法
// ─────────────────────────────────────────────────────
export interface SpotPayment {
  cash:   boolean;  // 現金
  icCard: boolean;  // IC カード（Suica / PASMO 等）
  qrCode: boolean;  // QRコード決済（PayPay / d払い 等）
}

// ─────────────────────────────────────────────────────
// spots コレクション
// ─────────────────────────────────────────────────────
export interface FirestoreSpot {
  /** 駐輪場名 */
  name:              string;
  /** 座標（GeoPoint） */
  coordinate:        GeoPoint;
  /** Geohash（範囲検索用、精度9） */
  geohash:           string;
  /** 住所（任意） */
  address?:          string;
  /** 排気量区分フラグ */
  capacity:          SpotCapacity;
  /** 収容台数（任意） */
  parkingCapacity?:  number;
  /** 精算方法 */
  payment:           SpotPayment;
  /** 無料 / 有料 / 未確認(null) */
  isFree:            boolean | null;
  /** 料金（円/時間）（任意） */
  pricePerHour?:     number;
  /** 料金テキスト（自由記述。例:「100円/30分」「1日最大800円」）*/
  priceInfo?:        string;
  /** 営業時間（任意） */
  openHours?:        string;
  /**
   * 閲覧数 — 「いま◯人が検討中」の可視化に使用。
   * チェックインなしでスポットの活況を伝えるための指標。
   */
  viewCount:         number;
  /**
   * Good 投票数 — lastVerifiedAt の更新トリガー。
   * 3票以上で verificationLevel が 'trusted' に昇格。
   */
  goodCount:         number;
  /**
   * Bad 報告数 — 3票以上で status が 'pending'（審査待ち）に遷移。
   */
  badReportCount:    number;
  /** スポットのステータス */
  status:            SpotStatus;
  /**
   * 信頼レベル
   *  official  → 駐輪場運営会社・公式提携店舗（公式バッジ表示）
   *  trusted   → 3人以上の Good で確定フラグ付与
   *  community → ユーザー投稿（初期値）
   */
  verificationLevel: VerificationLevel;
  /** データソース */
  source:            'seed' | 'user';
  /** 投稿者 userId（ユーザー投稿の場合のみ） */
  createdBy?:        string;
  /**
   * 最終更新日時 — 鮮度可視化の判定に使用。
   *  1ヶ月以内 → 青（信頼）
   *  3ヶ月以内 → 黄（注意）
   *  6ヶ月以上 → 赤（アラート）
   */
  updatedAt:         Timestamp;
  /** 最後に Good が押された日時 */
  lastVerifiedAt:    Timestamp;
  /** 作成日時 */
  createdAt:         Timestamp;
  /** ゲリラスポット（公式DBにない隠れ駐輪場） */
  isGuerrilla?:      boolean;
}

// ─────────────────────────────────────────────────────
// users コレクション
// ─────────────────────────────────────────────────────
export interface FirestoreUser {
  /** 表示名 */
  displayName:  string;
  /** プロフィール画像URL（Firebase Storage） */
  photoUrl?:    string;
  /** 作成日時 */
  createdAt:    Timestamp;
  /** 最終更新日時 */
  updatedAt:    Timestamp;
}

// ─────────────────────────────────────────────────────
// reviews コレクション
// ─────────────────────────────────────────────────────
export interface FirestoreReview {
  /** 対象スポットのドキュメントID */
  spotId:     string;
  /** 投稿ユーザーのドキュメントID */
  userId:     string;
  /** 星評価（1〜5） */
  score:      number;
  /** コメント（任意） */
  comment?:   string;
  /** 写真URL一覧（Firebase Storage）— 証拠写真として機能 */
  photoUrls:  string[];
  /** 写真タグ（看板 / 入口 / その他）— 未設定の場合は undefined */
  photoTag?:  PhotoTag;
  /** 「役に立った」カウント */
  goodCount:  number;
  /** 「間違い」カウント */
  badCount:   number;
  /** 作成日時 */
  createdAt:  Timestamp;
  /** 最終更新日時 */
  updatedAt:  Timestamp;
}

// ─────────────────────────────────────────────────────
// validations コレクション（Good / Bad 投票）
// ─────────────────────────────────────────────────────
/**
 * §2.3 相互監視（バリデーション）
 *  - spots/{spotId}/validations/{userId} に保存（1ユーザー1票制）
 *  - type='good' が 3票 → spots.verificationLevel を 'trusted' に昇格
 *  - type='bad'  が 3票 → spots.status を 'pending' に降格（自動非表示）
 */
export interface FirestoreValidation {
  /** 対象スポットのドキュメントID */
  spotId:    string;
  /** 投票ユーザーのドキュメントID */
  userId:    string;
  /** 投票タイプ */
  type:      ValidationType;
  /** 投票日時 */
  createdAt: Timestamp;
}

// ─────────────────────────────────────────────────────
// hazard_reports コレクション（バイク特化ハザードマップ）
// ─────────────────────────────────────────────────────
/**
 * §VISION-02 ハザードマップ MVP
 * ユーザー生成データのみ。30日で自動期限切れ。
 */
export interface FirestoreHazardReport {
  /** 関連スポットID（任意 — スポットに紐づかない独立報告も可） */
  spotId?:      string;
  /** 座標（GeoPoint） */
  coordinate:   GeoPoint;
  /** Geohash（範囲検索用、精度9） */
  geohash:      string;
  /** 危険タイプ */
  type:         HazardType;
  /** 補足説明（任意） */
  description?: string;
  /** 報告者 userId */
  reportedBy:   string;
  /** 作成日時 */
  createdAt:    Timestamp;
  /** 有効期限（作成から30日後。クエリで期限切れを除外） */
  expiresAt:    Timestamp;
}

// ─────────────────────────────────────────────────────
// theft_alerts コレクション（盗難防止コミュニティネットワーク）
// ─────────────────────────────────────────────────────
/** 盗難アラートのステータス */
export type TheftAlertStatus = 'active' | 'found' | 'cancelled';

/**
 * §VISION-05 盗難防止コミュニティネットワーク MVP
 * ライダー同士の「見かけたら教えて」アラート。
 */
export interface FirestoreTheftAlert {
  /** 投稿者 userId */
  userId:           string;
  /** 車両名（例: CBR650R） */
  vehicleName:      string;
  /** 説明・特徴 */
  description:      string;
  /** 最終目撃地点（GeoPoint） */
  lastSeenLocation: GeoPoint;
  /** Geohash（範囲検索用、精度9） */
  lastSeenGeohash:  string;
  /** 写真URL（任意） */
  photoUrl?:        string;
  /** ステータス */
  status:           TheftAlertStatus;
  /** 作成日時 */
  createdAt:        Timestamp;
}

// ─────────────────────────────────────────────────────
// Firestore コレクションパス定数
// ─────────────────────────────────────────────────────
export const COLLECTIONS = {
  SPOTS:           'spots',
  USERS:           'users',
  REVIEWS:         'reviews',
  VALIDATIONS:     'validations',
  USER_ACTIVITY:   'user_activity',
  PUSH_TOKENS:     'push_tokens',
  HAZARD_REPORTS:  'hazard_reports',
  THEFT_ALERTS:    'theft_alerts',
  BETA_ERRORS:     'beta_errors',
  BETA_FEEDBACK:   'beta_feedback',
} as const;
