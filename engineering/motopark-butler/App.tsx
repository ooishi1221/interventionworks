import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  Platform,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRef, useState } from 'react';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useDatabase } from './src/hooks/useDatabase';
import { MapScreen, MapScreenHandle } from './src/screens/MapScreen';
import { MyBikeScreen } from './src/screens/MyBikeScreen';
import { ParkedScreen } from './src/screens/ParkedScreen';
import { FavoritesScreen } from './src/screens/FavoritesScreen';
import { FontSize, Spacing } from './src/constants/theme';
import { ParkingPin, UserCC } from './src/types';

// iOS dark mode system colors
const SYS_BLUE    = '#0A84FF';
const SYS_GRAY    = '#636366';
const TAB_BG      = '#1C1C1E';
const TAB_BORDER  = 'rgba(255,255,255,0.12)';

type Tab = 'map' | 'favorites' | 'register' | 'myBike';

type TabDef =
  | { id: Tab; label: string; lib: 'ion'; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap }
  | { id: Tab; label: string; lib: 'mci'; icon: string; iconActive: string };

const TABS: TabDef[] = [
  { id: 'map',       label: 'マップ',      lib: 'ion', icon: 'map-outline',        iconActive: 'map'        },
  { id: 'favorites', label: 'お気に入り', lib: 'ion', icon: 'heart-outline',      iconActive: 'heart'      },
  { id: 'register',  label: '共有',  lib: 'ion', icon: 'add-circle-outline', iconActive: 'add-circle' },
  { id: 'myBike',    label: 'マイバイク', lib: 'mci', icon: 'motorbike',          iconActive: 'motorbike'  },
];

export default function App() {
  const { status, error } = useDatabase();
  const [tab, setTab]               = useState<Tab>('map');
  const [userCC, setUserCC]         = useState<UserCC>(125); // デフォルト: 原付二種
  const [focusSpot, setFocusSpot]   = useState<ParkingPin | null>(null);
  const [mapRefreshTrigger, setMapRefreshTrigger] = useState(0);
  const mapScreenRef = useRef<MapScreenHandle>(null);

  /** タブ押下ハンドラ。探すタブを2度押しするとマップをリセット */
  const handleTabPress = (id: Tab) => {
    if (id === 'map' && tab === 'map') {
      mapScreenRef.current?.resetView();
    } else {
      setTab(id);
    }
  };

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={SYS_BLUE} />
        <Text style={styles.loadingText}>起動中...</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>起動エラー</Text>
        <Text style={styles.errorDetail}>{error?.message}</Text>
      </View>
    );
  }

  const handleGoToSpot = (spot: ParkingPin) => {
    setFocusSpot(spot);
    setTab('map');
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />

      <View style={styles.content}>
        {/* MapScreen は常にマウント（タブ切替で位置を保持するため） */}
        <View style={[StyleSheet.absoluteFillObject, tab !== 'map' && { display: 'none' }]} pointerEvents={tab === 'map' ? 'auto' : 'none'}>
          <MapScreen
            ref={mapScreenRef}
            userCC={userCC}
            onOpenMyBike={() => setTab('myBike')}
            onChangeCC={(cc) => setUserCC(cc)}
            focusSpot={focusSpot}
            onFocusConsumed={() => setFocusSpot(null)}
            refreshTrigger={mapRefreshTrigger}
          />
        </View>
        {tab === 'favorites' && (
          <FavoritesScreen
            onGoToMap={() => setTab('map')}
            onGoToSpot={handleGoToSpot}
          />
        )}
        {tab === 'register' && (
          <ParkedScreen
            onSpotSaved={() => setMapRefreshTrigger((n) => n + 1)}
            onGoToSpot={handleGoToSpot}
          />
        )}
        {tab === 'myBike' && (
          <MyBikeScreen
            userCC={userCC}
            onChangeCC={(cc) => {
              setUserCC(cc);
              setTab('map');
              // 注: mapScreenRef.resetView() は呼ばない → 地図の位置はそのまま維持
            }}
          />
        )}
      </View>

      <SafeAreaView style={styles.tabBarWrapper}>
        <View style={styles.tabBar}>
          {TABS.map((t) => {
            const isActive = tab === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={styles.tabItem}
                onPress={() => handleTabPress(t.id)}
                activeOpacity={0.6}
              >
                {t.lib === 'mci' ? (
                  <MaterialCommunityIcons
                    name={(isActive ? t.iconActive : t.icon) as any}
                    size={24}
                    color={isActive ? SYS_BLUE : SYS_GRAY}
                  />
                ) : (
                  <Ionicons
                    name={(isActive ? t.iconActive : t.icon) as keyof typeof Ionicons.glyphMap}
                    size={24}
                    color={isActive ? SYS_BLUE : SYS_GRAY}
                  />
                )}
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  content: { flex: 1 },
  center: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText:  { color: SYS_GRAY,   fontSize: FontSize.md },
  errorText:    { color: '#FF453A',  fontSize: FontSize.lg, fontWeight: '700' },
  errorDetail:  { color: SYS_GRAY,   fontSize: FontSize.sm, paddingHorizontal: Spacing.lg, textAlign: 'center' },
  tabBarWrapper: {
    backgroundColor: TAB_BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: TAB_BORDER,
  },
  tabBar: { flexDirection: 'row', height: Platform.OS === 'android' ? 56 : 52 },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    color: SYS_GRAY,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    color: SYS_BLUE,
    fontWeight: '600',
  },
});
