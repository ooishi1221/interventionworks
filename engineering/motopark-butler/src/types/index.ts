export type VehicleType = 'motorcycle' | 'bicycle' | 'scooter';

export type UserCC = 50 | 125 | 250 | 400;
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
  createdAt: string;
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
