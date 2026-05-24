import AsyncStorage from '@react-native-async-storage/async-storage';

const NAV_TARGET_KEY = 'moto_logos_nav_target';

export interface NavigationTarget {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  registeredAt: number;
}

export async function setNavigationTarget(spot: {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}): Promise<void> {
  const target: NavigationTarget = {
    id: spot.id,
    name: spot.name,
    latitude: spot.latitude,
    longitude: spot.longitude,
    registeredAt: Date.now(),
  };
  await AsyncStorage.setItem(NAV_TARGET_KEY, JSON.stringify(target));
}

export async function getNavigationTarget(): Promise<NavigationTarget | null> {
  const raw = await AsyncStorage.getItem(NAV_TARGET_KEY);
  if (!raw) return null;
  try {
    const target: NavigationTarget = JSON.parse(raw);
    // 24h 以上経過していたら無効
    if (Date.now() - target.registeredAt > 24 * 60 * 60 * 1000) {
      await AsyncStorage.removeItem(NAV_TARGET_KEY);
      return null;
    }
    return target;
  } catch {
    await AsyncStorage.removeItem(NAV_TARGET_KEY);
    return null;
  }
}

export async function clearNavigationTarget(): Promise<void> {
  await AsyncStorage.removeItem(NAV_TARGET_KEY);
}
