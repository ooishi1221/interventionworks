import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  FlatList,
  Platform,
  Animated as RNAnimated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, FontSize } from '../constants/theme';
import { Favorite, ParkingPin } from '../types';
import {
  getAllFavorites,
  removeFavorite,
  getAllUserSpots,
  toggleFavoritePinned,
  updateFavoriteSortOrder,
} from '../db/database';
import { ADACHI_PARKING } from '../data/adachi-parking';

// ─── 色定数 ─────────────────────────────────────────────
const C = {
  bg:     '#000000',
  card:   '#1C1C1E',
  border: 'rgba(255,255,255,0.10)',
  text:   '#F2F2F7',
  sub:    '#8E8E93',
  blue:   '#0A84FF',
  pink:   '#FF375F',
  red:    '#FF453A',
  green:  '#30D158',
  purple: '#BF5AF2',
};

interface Props {
  onGoToMap: () => void;
  onGoToSpot: (spot: ParkingPin) => void;
}

interface FavoriteItem {
  key: string;
  favorite: Favorite;
  spot: ParkingPin | null;
}

function ccLabel(maxCC: number | null): string {
  if (maxCC === null) return '制限なし';
  if (maxCC === 50)   return '原付のみ';
  if (maxCC === 125)  return '〜125cc';
  if (maxCC === 250)  return '〜250cc';
  return `〜${maxCC}cc`;
}

function badgeColor(spot: ParkingPin): string {
  if (spot.source === 'user') return C.purple;
  if (spot.maxCC === null)    return C.blue;
  if (spot.maxCC >= 250)     return C.green;
  if (spot.maxCC >= 125)     return C.blue;
  return C.sub;
}

export function FavoritesScreen({ onGoToMap, onGoToSpot }: Props) {
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reorderMode, setReorderMode] = useState(false);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const favs = await getAllFavorites();
      const userSpots = await getAllUserSpots();

      const resolved: FavoriteItem[] = favs.map((fav) => {
        let spot: ParkingPin | null = null;

        if (fav.source === 'seed') {
          spot = ADACHI_PARKING.find((p) => p.id === fav.spotId) ?? null;
        } else if (fav.source === 'user') {
          const numId = parseInt(fav.spotId.replace('user_', ''), 10);
          const found = userSpots.find((s) => s.id === numId);
          if (found) {
            spot = {
              id: `user_${found.id}`,
              name: found.name,
              latitude: found.latitude,
              longitude: found.longitude,
              maxCC: found.maxCC,
              isFree: found.isFree,
              capacity: found.capacity ?? null,
              source: 'user',
              address: found.address,
            };
          }
        }

        return { key: `${fav.source}_${fav.spotId}`, favorite: fav, spot };
      });

      // ゴースト除去: 存在しないスポットのお気に入りを自動クリーンアップ
      const ghosts = resolved.filter((r) => r.spot === null);
      for (const g of ghosts) {
        removeFavorite(g.favorite.spotId, g.favorite.source).catch(() => {});
      }

      setItems(resolved.filter((r) => r.spot !== null));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── 削除（左スワイプ） ───────────────────────────────
  const handleRemove = async (item: FavoriteItem) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await removeFavorite(item.favorite.spotId, item.favorite.source);
    setItems((prev) => prev.filter((i) => i.key !== item.key));
  };

  // ── ピン留めトグル（右スワイプ） ────────────────────
  const handlePin = async (item: FavoriteItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const nowPinned = await toggleFavoritePinned(item.favorite.spotId, item.favorite.source);
    setItems((prev) => {
      const updated = prev.map((i) =>
        i.key === item.key
          ? { ...i, favorite: { ...i.favorite, isPinned: nowPinned ? 1 : 0 } }
          : i
      );
      const pinned = updated.filter((i) => i.favorite.isPinned === 1);
      const unpinned = updated.filter((i) => i.favorite.isPinned !== 1);
      return [...pinned, ...unpinned];
    });
    swipeableRefs.current.get(item.key)?.close();
  };

  // ── 並び替え（上下移動） ─────────────────────────────
  const moveItem = async (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= items.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = [...items];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setItems(updated);
    const sortItems = updated.map((item, idx) => ({
      spotId: item.favorite.spotId,
      source: item.favorite.source,
      sortOrder: idx,
    }));
    await updateFavoriteSortOrder(sortItems);
  };

  // ── 左スワイプ背景（赤・ゴミ箱） ────────────────────
  const renderRightActions = (
    _progress: RNAnimated.AnimatedInterpolation<number>,
    dragX: RNAnimated.AnimatedInterpolation<number>,
    item: FavoriteItem,
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-100, -50, 0],
      outputRange: [1.1, 1, 0.8],
      extrapolate: 'clamp',
    });
    return (
      <TouchableOpacity
        style={styles.swipeRight}
        onPress={() => {
          Alert.alert('お気に入り解除', `「${item.spot?.name ?? '?'}」を解除しますか？`, [
            { text: 'キャンセル', style: 'cancel', onPress: () => swipeableRefs.current.get(item.key)?.close() },
            { text: '解除', style: 'destructive', onPress: () => handleRemove(item) },
          ]);
        }}
      >
        <RNAnimated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
          <Ionicons name="trash" size={24} color="#fff" />
          <Text style={styles.swipeLabel}>削除</Text>
        </RNAnimated.View>
      </TouchableOpacity>
    );
  };

  // ── 右スワイプ背景（青・ピン） ──────────────────────
  const renderLeftActions = (
    _progress: RNAnimated.AnimatedInterpolation<number>,
    dragX: RNAnimated.AnimatedInterpolation<number>,
    item: FavoriteItem,
  ) => {
    const isPinned = item.favorite.isPinned === 1;
    const scale = dragX.interpolate({
      inputRange: [0, 50, 100],
      outputRange: [0.8, 1, 1.1],
      extrapolate: 'clamp',
    });
    return (
      <TouchableOpacity
        style={[styles.swipeLeft, isPinned && styles.swipeLeftUnpin]}
        onPress={() => handlePin(item)}
      >
        <RNAnimated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
          <Ionicons name={isPinned ? 'pin-outline' : 'pin'} size={24} color="#fff" />
          <Text style={styles.swipeLabel}>{isPinned ? '解除' : 'ピン留め'}</Text>
        </RNAnimated.View>
      </TouchableOpacity>
    );
  };

  // ── カードレンダリング ────────────────────────────────
  const renderItem = ({ item, index }: { item: FavoriteItem; index: number }) => {
    if (!item.spot) return null;
    const spot = item.spot;
    const isPinned = item.favorite.isPinned === 1;

    return (
      <Swipeable
        ref={(ref) => {
          if (ref) swipeableRefs.current.set(item.key, ref);
          else swipeableRefs.current.delete(item.key);
        }}
        renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
        renderLeftActions={(progress, dragX) => renderLeftActions(progress, dragX, item)}
        onSwipeableWillOpen={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
        onSwipeableOpen={(direction) => {
          if (direction === 'left') handlePin(item);
        }}
        overshootLeft={false}
        overshootRight={false}
        friction={Platform.OS === 'android' ? 3 : 2}
        rightThreshold={Platform.OS === 'android' ? 60 : 40}
        leftThreshold={Platform.OS === 'android' ? 60 : 40}
      >
        <View style={[styles.card, isPinned && styles.cardPinned]}>
          {/* ピンアイコン */}
          {isPinned && (
            <View style={styles.pinIndicator}>
              <Ionicons name="pin" size={12} color={C.blue} />
            </View>
          )}

          {/* 並び替えモード: 上下ボタン */}
          {reorderMode && (
            <View style={styles.reorderBtns}>
              <TouchableOpacity
                onPress={() => moveItem(index, -1)}
                disabled={index === 0}
                style={[styles.reorderBtn, index === 0 && { opacity: 0.2 }]}
              >
                <Ionicons name="chevron-up" size={18} color={C.text} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => moveItem(index, 1)}
                disabled={index === items.length - 1}
                style={[styles.reorderBtn, index === items.length - 1 && { opacity: 0.2 }]}
              >
                <Ionicons name="chevron-down" size={18} color={C.text} />
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.cardBody}
            onPress={() => onGoToSpot(spot)}
            activeOpacity={0.75}
          >
            <View style={styles.cardLeft}>
              <Text style={styles.cardName} numberOfLines={2}>{spot.name}</Text>

              <View style={styles.badgeRow}>
                {spot.source === 'user' && (
                  <View style={[styles.badge, { backgroundColor: C.purple }]}>
                    <Text style={styles.badgeText}>ユーザー</Text>
                  </View>
                )}
                <View style={[styles.badge, { backgroundColor: badgeColor(spot) }]}>
                  <Text style={styles.badgeText}>{ccLabel(spot.maxCC)}</Text>
                </View>
                {spot.isFree === true && (
                  <View style={[styles.badge, { backgroundColor: C.green }]}>
                    <Text style={styles.badgeText}>無料</Text>
                  </View>
                )}
                {spot.isFree === false && (
                  <View style={[styles.badge, styles.badgeMuted]}>
                    <Text style={styles.badgeTextMuted}>有料</Text>
                  </View>
                )}
                {spot.capacity != null && (
                  <View style={[styles.badge, styles.badgeMuted]}>
                    <Text style={styles.badgeTextMuted}>{spot.capacity}台</Text>
                  </View>
                )}
              </View>

              {spot.address && (
                <Text style={styles.cardMeta} numberOfLines={1}>{spot.address}</Text>
              )}
            </View>

            <Ionicons name="chevron-forward" size={18} color={C.sub} />
          </TouchableOpacity>
        </View>
      </Swipeable>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Ionicons name="heart" size={20} color={C.pink} />
        <Text style={styles.title}>
          お気に入り{items.filter((i) => i.spot).length > 0 && (
            <Text style={styles.countInline}>{` (${items.filter((i) => i.spot).length})`}</Text>
          )}
        </Text>
        {items.filter((i) => i.spot).length > 1 && (
          <TouchableOpacity
            style={[styles.reorderToggle, reorderMode && styles.reorderToggleActive]}
            onPress={() => setReorderMode((v) => !v)}
          >
            <Ionicons name="swap-vertical" size={18} color={reorderMode ? '#fff' : C.sub} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.blue} size="large" />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="heart-outline" size={64} color={C.pink} />
          <Text style={styles.emptyText}>お気に入りスポットがまだありません</Text>
          <Text style={styles.emptyHint}>マップでピンをタップして{'\n'}仲間のおすすめを保存しよう</Text>
          <TouchableOpacity style={styles.goMapBtn} onPress={onGoToMap}>
            <Ionicons name="map" size={16} color="#fff" />
            <Text style={styles.goMapBtnText}>マップへ</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.hintBar}>
            <Ionicons name="information-circle-outline" size={14} color={C.sub} />
            <Text style={styles.hintText}>
              左スワイプで削除 / 右スワイプでピン留め
            </Text>
          </View>
          <FlatList
            data={items}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 80 }}
            style={styles.list}
          />
        </>
      )}
    </SafeAreaView>
  );
}

// ─── スタイル ──────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  title: { color: C.text, fontSize: FontSize.lg, fontWeight: '700', flex: 1 },
  countInline: {
    color: C.sub,
    fontSize: FontSize.lg,
    fontWeight: '400',
  },
  reorderToggle: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  reorderToggleActive: {
    backgroundColor: C.blue,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  emptyText: { color: C.text, fontSize: FontSize.md, fontWeight: '600' },
  emptyHint: { color: C.sub, fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  goMapBtn: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.blue,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  goMapBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '600' },

  hintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  hintText: { color: C.sub, fontSize: 11 },

  list: { flex: 1 },

  // ── カード ─────────────────────────────────────────
  card: {
    backgroundColor: C.card,
    marginHorizontal: Spacing.md,
    marginVertical: 4,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    overflow: 'hidden',
  },
  cardPinned: {
    borderColor: 'rgba(10,132,255,0.3)',
  },
  pinIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
  },
  cardBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  cardLeft: { flex: 1, gap: 4, paddingRight: 20 },
  cardName: { color: C.text, fontSize: FontSize.md, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeMuted: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  badgeTextMuted: { color: C.sub, fontSize: 11 },
  cardMeta: { color: C.sub, fontSize: 12 },

  // ── 並び替えボタン ────────────────────────────────
  reorderBtns: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 8,
    gap: 2,
  },
  reorderBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── スワイプ背景 ──────────────────────────────────
  swipeRight: {
    backgroundColor: C.red,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginVertical: 4,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    marginRight: Spacing.md,
  },
  swipeLeft: {
    backgroundColor: C.blue,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginVertical: 4,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    marginLeft: Spacing.md,
  },
  swipeLeftUnpin: {
    backgroundColor: C.sub,
  },
  swipeLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
});
