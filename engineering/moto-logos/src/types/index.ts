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
  openHours?: string;
  updatedAt?: string; // ISO8601
}

export interface UserSpot {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  maxCC: MaxCC;
  isFree: boolean;
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
  licensePlate?: string;
  color?: string;
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
