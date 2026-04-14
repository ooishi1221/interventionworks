export type VehicleType = 'motorcycle' | 'bicycle' | 'scooter';

/** 50=原付一種, 125=原付二種, 400=普通二輪, null=大型二輪 */
export type UserCC = 50 | 125 | 400 | null;
export type MaxCC = 50 | 125 | 250 | null;

export interface ParkingPin {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  maxCC: MaxCC;
  isFree: boolean | null;
  capacity: number | null;
  source: 'seed' | 'osm' | 'user';
  address?: string;
  pricePerHour?: number;
  priceInfo?: string;
  openHours?: string;
  paymentCash?: boolean;
  paymentIC?: boolean;
  paymentQR?: boolean;
  updatedAt?: string; // ISO8601
  /** リアルタイム駐車中台数（概算） */
  currentParked?: number;
  /** 最後にライダーが到着した日時（温度計算用） */
  lastArrivedAt?: string; // ISO8601
  /** ゲリラスポット（公式DBにない隠れ駐輪場） */
  isGuerrilla?: boolean;
}

export interface UserSpot {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  maxCC: MaxCC;
  isFree: boolean | null;
  capacity?: number;
  pricePerHour?: number;
  openHours?: string;
  notes?: string;
  createdAt: string;
}

export interface Favorite {
  id: number;
  spotId: string;
  source: 'seed' | 'user';
  isPinned: number;
  sortOrder: number;
  createdAt: string;
}

/** ユーザー投稿レビュー（コメント・写真対応） */
export interface Review {
  id: number;
  /** Firestore ドキュメント ID（Firestore 由来のレビューのみ） */
  firestoreId?: string;
  spotId: string;
  source: 'seed' | 'user';
  score: number;
  comment: string | null;
  photoUri: string | null;
  /** 報告時のバイク車種名（例: 「CBR650R」） */
  vehicleName?: string | null;
  /** 写真タグ（看板 / 入口 / その他） */
  photoTag?: 'sign' | 'entrance' | 'general' | null;
  createdAt: string;
}

export interface ReviewSummary {
  avg: number;
  count: number;
}

export interface Vehicle {
  id: number;
  name: string;
  type: VehicleType;
  cc?: UserCC;
  manufacturer?: string;
  model?: string;
  year?: number;
  color?: string;
  photoUrl?: string;
  tagline?: string;
  licensePlate?: string;
  notes?: string;
  createdAt: string;
}

export interface ParkingSpot {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  capacity?: number;
  isFree: boolean;
  pricePerHour?: number;
  openHours?: string;
  notes?: string;
  createdAt: string;
}

export interface ParkingSession {
  id: number;
  vehicleId: number;
  spotId: number;
  startedAt: string;
  endedAt?: string;
  notes?: string;
}

export interface ProximityAlert {
  spotId: number;
  spotName: string;
  distanceMeters: number;
}
