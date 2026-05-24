import type { ParkingPin } from './index';

export interface CenterButtonContext {
  mode: 'nav-target' | 'nearest-spot' | 'new-spot';
  spotName?: string;
  spot?: ParkingPin;
  /** 案内中のスポット名（200m以遠でもバナー表示用） */
  activeNavName?: string;
  activeNavSpot?: ParkingPin;
}
