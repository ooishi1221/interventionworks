/**
 * SearchResultsList — サーチタブ押下時に表示するフローティング最寄りリスト
 *
 * - 最寄り3件を常に展開状態で表示
 * - エリアサマリーモード（テキスト検索後: 「渋谷 — N件」+ ×クリア）
 * - スポットタップ → onSpotPress
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ParkingPin } from '../types';
import { Colors } from '../constants/theme';
import { spotFreshness, freshnessLabel, FRESHNESS_STYLE } from '../utils/freshness';

const C = Colors;

function fmtDist(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

function FreshDot({ spot }: { spot: ParkingPin }) {
  const fresh = spotFreshness(spot);
  const { color, opacity } = FRESHNESS_STYLE[fresh];
  return <View style={[styles.freshDot, { backgroundColor: color, opacity }]} />;
}

interface Props {
  items: { spot: ParkingPin; distanceM: number }[];
  areaName?: string | null;
  onSpotPress?: (spot: ParkingPin) => void;
  onClear?: () => void;
}

export function SearchResultsList({ items, areaName, onSpotPress, onClear }: Props) {
  if (items.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.card}>
        {/* ヘッダー */}
        <View style={styles.header}>
          {areaName ? (
            <Text style={styles.areaName} numberOfLines={1}>{areaName}</Text>
          ) : (
            <Text style={styles.title}>近くのスポット</Text>
          )}
          {onClear && (
            <TouchableOpacity onPress={onClear} style={styles.clearBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={14} color={C.sub} />
            </TouchableOpacity>
          )}
        </View>

        {/* リスト */}
        {items.map((item, i) => {
          const fresh = spotFreshness(item.spot);
          const freshColor = FRESHNESS_STYLE[fresh].color;
          return (
            <TouchableOpacity
              key={item.spot.id}
              style={styles.row}
              onPress={() => onSpotPress?.(item.spot)}
              activeOpacity={0.7}
            >
              <Text style={styles.rank}>{i + 1}</Text>
              <FreshDot spot={item.spot} />
              <Text style={styles.name} numberOfLines={1}>{item.spot.name}</Text>
              <Text style={[styles.freshLabel, { color: freshColor }]}>{freshnessLabel(fresh)}</Text>
              <Text style={styles.dist}>{fmtDist(item.distanceM)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 12,
    right: 12,
    zIndex: 8,
  },
  card: {
    backgroundColor: 'rgba(28,28,30,0.92)',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
    marginBottom: 2,
  },
  title: {
    color: C.sub,
    fontSize: 12,
    fontWeight: '600',
  },
  areaName: {
    color: C.text,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    gap: 8,
  },
  rank: {
    color: C.accent,
    fontSize: 13,
    fontWeight: '800',
    width: 16,
    textAlign: 'center',
  },
  freshDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  name: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    fontWeight: '500',
  },
  freshLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  dist: {
    color: C.sub,
    fontSize: 13,
  },
});
