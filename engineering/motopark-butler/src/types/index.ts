export type VehicleType = 'motorcycle' | 'bicycle' | 'scooter';

// ユーザーのバイク排気量
export type UserCC = 50 | 125 | 250 | 400;

// 駐輪場の最大許容排気量（null = 制限なし / 400cc以上OK）
export type MaxCC = 50 | 125 | 250 | null;

export interface ParkingPin {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  maxCC: MaxCC;           // null = 制限なし
  isFree: boolean | null; // null = 不明
  capacity: number | null;
  source: 'seed' | 'osm';
}

export interface Vehicle {
  id: number;
  name: string;
  type: VehicleType;
  cc: UserCC;
  licensePlate?: string;
  color?: string;
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
}

export interface Vehicle {
  id: number;
  name: string;           // 愛称 (例: 「赤いやつ」)
  type: VehicleType;
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
  openHours?: string;      // 例: "00:00-24:00"
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

// GPS近接検知用
export interface ProximityAlert {
  spotId: number;
  spotName: string;
  distanceMeters: number;
}
