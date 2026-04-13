/**
 * RadialMenu v5 — 4項目ラジアル
 *
 * 長押し → 現在地 / 最寄り / エリア更新 / 場所検索 が左上に扇形展開
 * 短押し → エリア再検索
 * ※ スポット登録は FAB「+」ボタンに移動済み
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  PanResponderGestureState,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

const TRIGGER_SIZE  = 56;
const ITEM_SIZE     = 52;
const RADIUS        = 95;
const LONG_PRESS_MS = 250;
const HIT_RADIUS    = 38;

function toXY(deg: number, r: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: r * Math.cos(rad), y: -r * Math.sin(rad) };
}

interface MenuItem {
  id: string;
  angle: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
}

// 4 アイテム: 90°→ 200° の弧（約37°間隔）
// ※ 「報告」は FAB に移動
const ITEMS: MenuItem[] = [
  { id: 'location', angle: 90,  icon: 'navigate',        color: '#0A84FF', label: '現在地' },
  { id: 'nearest',  angle: 127, icon: 'locate',           color: '#30D158', label: '最寄り' },
  { id: 'refresh',  angle: 164, icon: 'refresh-circle',   color: '#FF9F0A', label: '更新' },
  { id: 'search',   angle: 200, icon: 'search',           color: '#BF5AF2', label: '検索' },
];

const POSITIONS = ITEMS.map((m) => ({ ...m, ...toXY(m.angle, RADIUS) }));

interface Props {
  onGoToNearest: () => void;
  onGoToCurrentLocation: () => void;
  onResearchArea: () => void;
  onOpenSearch: () => void;
}

export function RadialMenu({ onGoToNearest, onGoToCurrentLocation, onResearchArea, onOpenSearch }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const progress  = useRef(new Animated.Value(0)).current;
  const trigScale = useRef(new Animated.Value(1)).current;
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOpen    = useRef(false);
  const hovered   = useRef<string | null>(null);

  const open = useCallback(() => {
    isOpen.current = true;
    setMenuOpen(true);
    hovered.current = null;
    setHoveredId(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Animated.spring(progress, { toValue: 1, tension: 160, friction: 11, useNativeDriver: true }).start();
    Animated.spring(trigScale, { toValue: 1.18, tension: 200, friction: 10, useNativeDriver: true }).start();
  }, []);

  const close = useCallback((selectedId?: string) => {
    isOpen.current = false;
    Animated.spring(progress, { toValue: 0, tension: 200, friction: 14, useNativeDriver: true }).start(() => {
      setMenuOpen(false);
      setHoveredId(null);
      hovered.current = null;
    });
    Animated.spring(trigScale, { toValue: 1, tension: 200, friction: 10, useNativeDriver: true }).start();

    if (selectedId) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (selectedId === 'location') onGoToCurrentLocation();
      else if (selectedId === 'nearest') onGoToNearest();
      else if (selectedId === 'refresh') onResearchArea();
      else if (selectedId === 'search') onOpenSearch();
    }
  }, [onGoToNearest, onGoToCurrentLocation, onResearchArea, onOpenSearch]);

  const checkHover = useCallback((dx: number, dy: number) => {
    let closest: string | null = null;
    let minDist = HIT_RADIUS;
    for (const p of POSITIONS) {
      const d = Math.sqrt((dx - p.x) ** 2 + (dy - p.y) ** 2);
      if (d < minDist) { minDist = d; closest = p.id; }
    }
    if (closest !== hovered.current) {
      hovered.current = closest;
      setHoveredId(closest);
      if (closest) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        longTimer.current = setTimeout(open, LONG_PRESS_MS);
        Animated.spring(trigScale, { toValue: 0.88, tension: 300, friction: 10, useNativeDriver: true }).start();
      },
      onPanResponderMove: (_e, gs: PanResponderGestureState) => {
        if (!isOpen.current && (Math.abs(gs.dx) > 12 || Math.abs(gs.dy) > 12)) {
          if (longTimer.current) { clearTimeout(longTimer.current); longTimer.current = null; }
        }
        if (isOpen.current) checkHover(gs.dx, gs.dy);
      },
      onPanResponderRelease: () => {
        if (longTimer.current) { clearTimeout(longTimer.current); longTimer.current = null; }
        if (isOpen.current) {
          close(hovered.current ?? undefined);
        } else {
          Animated.spring(trigScale, { toValue: 1, tension: 200, friction: 10, useNativeDriver: true }).start();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onResearchArea();
        }
      },
      onPanResponderTerminate: () => {
        if (longTimer.current) { clearTimeout(longTimer.current); longTimer.current = null; }
        if (isOpen.current) close();
        else Animated.spring(trigScale, { toValue: 1, tension: 200, friction: 10, useNativeDriver: true }).start();
      },
    })
  ).current;

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* アイテム群 */}
      {menuOpen && POSITIONS.map((pos) => {
        const isH = hoveredId === pos.id;
        const tx = progress.interpolate({ inputRange: [0, 1], outputRange: [0, pos.x] });
        const ty = progress.interpolate({ inputRange: [0, 1], outputRange: [0, pos.y] });
        const sc = progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.2, 0.85, isH ? 1.3 : 1] });
        const op = progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.5, 1] });

        return (
          <Animated.View key={pos.id} pointerEvents="none" style={[
            styles.item,
            { opacity: op, transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }] },
            isH && { shadowColor: pos.color, shadowOpacity: 0.9, shadowRadius: 18, elevation: 14 },
          ]}>
            <View style={[styles.itemInner, isH && { backgroundColor: `${pos.color}30`, borderColor: `${pos.color}88` }]}>
              <Ionicons name={pos.icon} size={isH ? 22 : 18} color={isH ? pos.color : '#E5E5EA'} />
            </View>
          </Animated.View>
        );
      })}

      {/* ホバー中のラベル（トリガー上に固定表示） */}
      {menuOpen && hoveredId && (() => {
        const hItem = ITEMS.find((i) => i.id === hoveredId);
        if (!hItem) return null;
        return (
          <View style={styles.hoverLabel}>
            <Text style={[styles.hoverLabelText, { color: hItem.color }]}>{hItem.label}</Text>
          </View>
        );
      })()}

      {/* トリガー */}
      <Animated.View style={[styles.trigger, { transform: [{ scale: trigScale }] }]} {...pan.panHandlers}>
        {menuOpen && <View style={styles.triggerGlow} />}
        <Ionicons name="options-outline" size={23} color={menuOpen ? '#FF9F0A' : '#E5E5EA'} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: RADIUS + TRIGGER_SIZE + 30,
    height: RADIUS + TRIGGER_SIZE + 30,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    overflow: 'visible',
  },
  trigger: {
    width: TRIGGER_SIZE, height: TRIGGER_SIZE, borderRadius: TRIGGER_SIZE / 2,
    backgroundColor: 'rgba(28,28,30,0.94)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 12,
    zIndex: 20,
  },
  triggerGlow: {
    ...StyleSheet.absoluteFillObject, borderRadius: TRIGGER_SIZE / 2,
    borderWidth: 2, borderColor: '#FF9F0A', opacity: 0.7,
  },
  item: {
    position: 'absolute',
    bottom: TRIGGER_SIZE / 2 - ITEM_SIZE / 2,
    right: TRIGGER_SIZE / 2 - ITEM_SIZE / 2,
    alignItems: 'center',
    zIndex: 10,
    overflow: 'visible',
  },
  itemInner: {
    width: ITEM_SIZE, height: ITEM_SIZE, borderRadius: ITEM_SIZE / 2,
    backgroundColor: 'rgba(28,28,30,0.96)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.45, shadowRadius: 6, elevation: 8,
  },
  hoverLabel: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(28,28,30,0.95)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  hoverLabelText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
