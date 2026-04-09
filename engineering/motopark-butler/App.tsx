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
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useDatabase } from './src/hooks/useDatabase';
import { MapScreen } from './src/screens/MapScreen';
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

interface TabDef {
  id: Tab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}

const TABS: TabDef[] = [
  { id: 'map',       label: '探す',      icon: 'map-outline',          iconActive: 'map'          },
  { id: 'favorites', label: 'お気に入り', icon: 'heart-outline',        iconActive: 'heart'        },
  { id: 'register',  label: '新規登録',  icon: 'add-circle-outline',   iconActive: 'add-circle'   },
  { id: 'myBike',    label: 'マイバイク', icon: 'bicycle-outline',      iconActive: 'bicycle'      },
];

export default function App() {
  const { status, error } = useDatabase();
  const [tab, setTab]       = useState<Tab>('map');
  const [userCC, setUserCC] = useState<UserCC>(125); // デフォルト: 原付二種
  const [focusSpot, setFocusSpot] = useState<ParkingPin | null>(null);

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
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={styles.content}>
        {tab === 'map' && (
          <MapScreen
            userCC={userCC}
            onOpenMyBike={() => setTab('myBike')}
            onChangeCC={(cc) => setUserCC(cc)}
            focusSpot={focusSpot}
            onFocusConsumed={() => setFocusSpot(null)}
          />
        )}
        {tab === 'favorites' && (
          <FavoritesScreen
            onGoToMap={() => setTab('map')}
            onGoToSpot={handleGoToSpot}
          />
        )}
        {tab === 'register' && <ParkedScreen />}
        {tab === 'myBike' && (
          <MyBikeScreen
            userCC={userCC}
            onChangeCC={(cc) => {
              setUserCC(cc);
              setTab('map');
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
                onPress={() => setTab(t.id)}
                activeOpacity={0.6}
              >
                <Ionicons
                  name={isActive ? t.iconActive : t.icon}
                  size={24}
                  color={isActive ? SYS_BLUE : SYS_GRAY}
                />
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
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
