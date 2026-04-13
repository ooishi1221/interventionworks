/**
 * NearbySpotsList — 画面上部の最寄り3件スリムリスト
 *
 * 1行 = NO・名前・距離。タップで地図ジャンプ+詳細シート。
 * ▾ タップで折りたたみ（タイトル行のみ残る）。
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ParkingPin } from '../types';
import { NearbySpotInfo } from '../hooks/useProximityState';

const C = {
  text: '#F2F2F7',
  sub: '#8E8E93',
  accent: '#FF6B00',
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
  const [collapsed, setCollapsed] = useState(false);
  const heightAnim = useRef(new Animated.Value(1)).current;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    Animated.spring(heightAnim, {
      toValue: next ? 0 : 1,
      tension: 200,
      friction: 20,
      useNativeDriver: false,
    }).start();
  };

  if (items.length === 0) return null;

  // リスト部分の最大高さ（1行28px × 3件）
  const listMaxHeight = heightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 28 * items.length + 4],
  });

  const listOpacity = heightAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.card}>
        {/* ヘッダー（タップで折りたたみ） */}
        <TouchableOpacity
          style={styles.header}
          onPress={toggle}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
        >
          <Ionicons
            name={collapsed ? 'chevron-forward' : 'chevron-down'}
            size={12}
            color={C.sub}
          />
          <Text style={styles.title}>近くのスポット</Text>
          {collapsed && items[0] && (
            <Text style={styles.collapsedHint} numberOfLines={1}>
              {items[0].spot.name} {formatDistance(items[0].distanceM)}
            </Text>
          )}
        </TouchableOpacity>

        {/* リスト本体（アニメーションで開閉） */}
        <Animated.View style={{ maxHeight: listMaxHeight, opacity: listOpacity, overflow: 'hidden' }}>
          {items.map((item, i) => (
            <TouchableOpacity
              key={item.spot.id}
              style={styles.row}
              onPress={() => onSpotPress?.(item.spot)}
              activeOpacity={0.7}
            >
              <Text style={styles.rank}>{i + 1}</Text>
              <Text style={styles.name} numberOfLines={1}>{item.spot.name}</Text>
              <Text style={styles.dist}>{formatDistance(item.distanceM)}</Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 70,
    left: 12,
    right: 12,
    zIndex: 8,
  },
  card: {
    backgroundColor: 'rgba(28,28,30,0.92)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },

  // ── ヘッダー ──────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 24,
  },
  title: {
    color: C.sub,
    fontSize: 11,
    fontWeight: '700',
  },
  collapsedHint: {
    flex: 1,
    color: C.text,
    fontSize: 11,
    marginLeft: 6,
    opacity: 0.6,
  },

  // ── 行（1行スリム） ──────────────────────────────
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    gap: 6,
  },
  rank: {
    color: C.accent,
    fontSize: 12,
    fontWeight: '800',
    width: 14,
    textAlign: 'center',
  },
  name: {
    flex: 1,
    color: C.text,
    fontSize: 13,
    fontWeight: '500',
  },
  dist: {
    color: C.sub,
    fontSize: 12,
  },
});
