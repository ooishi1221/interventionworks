/**
 * NearbySpotsList v3 — 上部フローティングバー
 *
 * デフォルト: 1行コンパクト表示（📍 + 最寄り3件インライン）
 * タップで展開: 3行リスト
 * 📍 = 現在地に戻る
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
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ParkingPin } from '../types';
import { NearbySpotInfo } from '../hooks/useProximityState';

const C = {
  text: '#F2F2F7',
  sub: '#8E8E93',
  accent: '#FF6B00',
  blue: '#0A84FF',
};

function fmtDist(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

interface Props {
  alternatives: NearbySpotInfo[];
  onSpotPress?: (spot: ParkingPin) => void;
  onLocationPress?: () => void;
  onSearchPress?: () => void;
}

export function NearbySpotsList({ alternatives, onSpotPress, onLocationPress, onSearchPress }: Props) {
  const items = useMemo(() => alternatives.slice(0, 3), [alternatives]);
  const [expanded, setExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(expandAnim, {
      toValue: next ? 1 : 0,
      tension: 240,
      friction: 20,
      useNativeDriver: false,
    }).start();
  };

  if (items.length === 0) return null;

  const listHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 36 * items.length],
  });
  const listOpacity = expandAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0, 1],
  });
  const inlineOpacity = expandAnim.interpolate({
    inputRange: [0, 0.3],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const barBottomRadius = expandAnim.interpolate({
    inputRange: [0, 0.3],
    outputRange: [22, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Animated.View style={[styles.bar, { borderBottomLeftRadius: barBottomRadius, borderBottomRightRadius: barBottomRadius }]}>
        {/* ── 現在地ボタン ─────────────────────────────── */}
        <TouchableOpacity
          style={styles.locBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onLocationPress?.(); }}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="locate" size={16} color={C.blue} />
        </TouchableOpacity>

        {/* ── ヘッダー行（タップで展開/折りたたみ） ────── */}
        <TouchableOpacity
          style={styles.headerTap}
          onPress={toggle}
          activeOpacity={0.7}
        >
          {/* 折りたたみ時: 最寄り1件のみ明確表示 */}
          <Animated.View style={[styles.inlineRow, { opacity: inlineOpacity }]}>
            <TouchableOpacity
              onPress={() => onSpotPress?.(items[0].spot)}
              activeOpacity={0.7}
              style={styles.inlineItem}
            >
              <Text style={styles.inlineRank}>1</Text>
              <Text style={styles.inlineName} numberOfLines={1}>
                {items[0].spot.name}
              </Text>
              <Text style={styles.inlineDist}>{fmtDist(items[0].distanceM)}</Text>
            </TouchableOpacity>
            {items.length > 1 && (
              <Text style={styles.inlineMore}>他{items.length - 1}件 ▾</Text>
            )}
          </Animated.View>

          {/* 展開時ヘッダー */}
          {expanded && (
            <View style={styles.expandedHeader}>
              <Text style={styles.expandedTitle}>近くのスポット</Text>
              <Ionicons name="chevron-up" size={14} color={C.sub} />
            </View>
          )}
        </TouchableOpacity>

        {/* ── 検索ボタン ──────────────────────────────── */}
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSearchPress?.(); }}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="search" size={15} color={C.text} />
        </TouchableOpacity>
      </Animated.View>

      {/* ── 展開リスト ────────────────────────────────── */}
      <Animated.View style={[styles.expandedList, { maxHeight: listHeight, opacity: listOpacity }]}>
        {items.map((item, i) => (
          <TouchableOpacity
            key={item.spot.id}
            style={styles.expandedRow}
            onPress={() => { onSpotPress?.(item.spot); toggle(); }}
            activeOpacity={0.7}
          >
            <Text style={styles.expandedRank}>{i + 1}</Text>
            <Text style={styles.expandedName} numberOfLines={1}>{item.spot.name}</Text>
            <Text style={styles.expandedDist}>{fmtDist(item.distanceM)}</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
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

  // ── メインバー（1行） ──────────────────────────────
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(28,28,30,0.88)',
    borderRadius: 22,
    height: 40,
    paddingLeft: 4,
    paddingRight: 12,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },

  // ── 現在地ボタン ──────────────────────────────────
  locBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(10,132,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── 検索ボタン ────────────────────────────────────
  searchBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── ヘッダータップ領域 ─────────────────────────────
  headerTap: {
    flex: 1,
    height: 40,
    justifyContent: 'center',
  },

  // ── インライン表示（折りたたみ時） ────────────────
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  inlineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 4,
  },
  inlineRank: {
    color: C.accent,
    fontSize: 11,
    fontWeight: '800',
  },
  inlineName: {
    color: C.text,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  inlineDist: {
    color: C.sub,
    fontSize: 12,
    fontWeight: '500',
  },
  inlineMore: {
    color: C.sub,
    fontSize: 11,
    marginLeft: 6,
  },

  // ── 展開時ヘッダー ────────────────────────────────
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  expandedTitle: {
    color: C.sub,
    fontSize: 12,
    fontWeight: '600',
  },

  // ── 展開リスト ─────────────────────────────────────
  expandedList: {
    backgroundColor: 'rgba(28,28,30,0.88)',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    marginTop: -1,
    paddingHorizontal: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderTopWidth: 0,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    gap: 8,
  },
  expandedRank: {
    color: C.accent,
    fontSize: 13,
    fontWeight: '800',
    width: 16,
    textAlign: 'center',
  },
  expandedName: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    fontWeight: '500',
  },
  expandedDist: {
    color: C.sub,
    fontSize: 13,
  },
});
