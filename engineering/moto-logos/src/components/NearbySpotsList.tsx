/**
 * NearbySpotsList — 画面上部に常時表示する最寄りスポット3件
 *
 * ライブフィードの直下に配置。
 * 1件目がダメだったら2件目を押すだけ。メニュー開閉ゼロ。
 */
import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ParkingPin } from '../types';
import { NearbySpotInfo } from '../hooks/useProximityState';

// ── カラー ────────────────────────────────────────────
const C = {
  text: '#F2F2F7',
  sub: '#8E8E93',
  accent: '#FF6B00',
  blue: '#0A84FF',
};

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

interface Props {
  alternatives: NearbySpotInfo[];
  onSpotPress?: (spot: ParkingPin) => void;
}

export function NearbySpotsList({ alternatives, onSpotPress }: Props) {
  const items = useMemo(() => alternatives.slice(0, 3), [alternatives]);

  const openNav = useCallback((spot: ParkingPin) => {
    const url = Platform.select({
      ios: `comgooglemaps://?daddr=${spot.latitude},${spot.longitude}&directionsmode=driving`,
      android: `google.navigation:q=${spot.latitude},${spot.longitude}`,
    }) ?? `https://maps.google.com/maps?daddr=${spot.latitude},${spot.longitude}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/maps?daddr=${spot.latitude},${spot.longitude}`),
    );
  }, []);

  if (items.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.card}>
        <Text style={styles.title}>近くのスポット</Text>
        {items.map((item, i) => (
          <TouchableOpacity
            key={item.spot.id}
            style={[styles.row, i < items.length - 1 && styles.rowBorder]}
            onPress={() => onSpotPress?.(item.spot)}
            activeOpacity={0.7}
          >
            <View style={styles.rankBadge}>
              <Text style={styles.rankText}>{i + 1}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>{item.spot.name}</Text>
              <Text style={styles.meta}>{formatDistance(item.distanceM)}</Text>
            </View>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => openNav(item.spot)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="navigate" size={18} color={C.blue} />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 70, // ライブフィードの下
    left: 12,
    right: 12,
    zIndex: 8,
  },
  card: {
    backgroundColor: 'rgba(28,28,30,0.94)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
  },
  title: {
    color: C.sub,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,107,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    color: C.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  info: {
    flex: 1,
  },
  name: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    color: C.sub,
    fontSize: 12,
    marginTop: 1,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(10,132,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
