import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View, TouchableOpacity, SafeAreaView } from 'react-native';
import { useState } from 'react';
import { useDatabase } from './src/hooks/useDatabase';
import { MapScreen } from './src/screens/MapScreen';
import { MyBikeScreen } from './src/screens/MyBikeScreen';
import { ParkedScreen } from './src/screens/ParkedScreen';
import { Colors, FontSize, Spacing } from './src/constants/theme';
import { UserCC } from './src/types';

type Tab = 'map' | 'myBike' | 'parked';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'map',    label: '駐輪場を探す', icon: '🅿️' },
  { id: 'parked', label: '駐めた場所',   icon: '📍' },
  { id: 'myBike', label: 'マイバイク',   icon: '🏍️' },
];

export default function App() {
  const { status, error } = useDatabase();
  const [tab, setTab] = useState<Tab>('map');
  const [userCC, setUserCC] = useState<UserCC>(400);

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>起動中...</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>⚠️ 起動エラー</Text>
        <Text style={styles.errorDetail}>{error?.message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={styles.content}>
        {tab === 'map' && (
          <MapScreen
            userCC={userCC}
            onOpenMyBike={() => setTab('myBike')}
          />
        )}
        {tab === 'parked' && <ParkedScreen onBack={() => setTab('map')} />}
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
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={styles.tabItem}
              onPress={() => setTab(t.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.tabIcon}>{t.icon}</Text>
              <Text style={[styles.tabLabel, tab === t.id && styles.tabLabelActive]}>
                {t.label}
              </Text>
              {tab === t.id && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
  },
  center: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },
  errorText: {
    color: Colors.danger,
    fontSize: FontSize.lg,
    fontWeight: 'bold',
  },
  errorDetail: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    paddingHorizontal: Spacing.lg,
    textAlign: 'center',
  },
  tabBarWrapper: {
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  tabBar: {
    flexDirection: 'row',
    height: 64,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    position: 'relative',
  },
  tabIcon: {
    fontSize: 22,
  },
  tabLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: Colors.accent,
    fontWeight: '700',
  },
  tabIndicator: {
    position: 'absolute',
    top: 0,
    left: '25%',
    right: '25%',
    height: 2,
    backgroundColor: Colors.accent,
    borderRadius: 1,
  },
});
