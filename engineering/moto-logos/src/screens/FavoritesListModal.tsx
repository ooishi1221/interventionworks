/**
 * FavoritesListModal — お気に入り一覧（モーダル）
 * RiderScreen のスタッツカードからタップで開く
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  FlatList,
  Modal,
  Platform,
  Animated as RNAnimated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Spacing, FontSize } from '../constants/theme';
import { Favorite, ParkingPin } from '../types';
import {
  getAllFavorites,
  removeFavorite,
  getAllUserSpots,
} from '../db/database';
import { ADACHI_PARKING } from '../data/adachi-parking';

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

interface Props {
  visible: boolean;
  onClose: () => void;
  onGoToSpot?: (spot: ParkingPin) => void;
}

export function FavoritesListModal({ visible, onClose, onGoToSpot }: Props) {
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  const load = useCallback(async () => {
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
            id: `user_${found.id}`, name: found.name,
            latitude: found.latitude, longitude: found.longitude,
            maxCC: found.maxCC, isFree: found.isFree,
            capacity: found.capacity ?? null, source: 'user', address: found.address,
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
  }, []);

  useEffect(() => { if (visible) load(); }, [visible]);

  const handleRemove = async (item: FavoriteItem) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await removeFavorite(item.favorite.spotId, item.favorite.source);
    setItems((prev) => prev.filter((i) => i.key !== item.key));
  };

  const renderRightActions = (
    _progress: RNAnimated.AnimatedInterpolation<number>,
    dragX: RNAnimated.AnimatedInterpolation<number>,
    item: FavoriteItem,
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-100, -50, 0], outputRange: [1.1, 1, 0.8], extrapolate: 'clamp',
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
          <Ionicons name="trash" size={22} color="#fff" />
          <Text style={styles.swipeLabel}>削除</Text>
        </RNAnimated.View>
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item }: { item: FavoriteItem }) => {
    if (!item.spot) return null;
    const spot = item.spot;
    return (
      <Swipeable
        ref={(ref) => { if (ref) swipeableRefs.current.set(item.key, ref); else swipeableRefs.current.delete(item.key); }}
        renderRightActions={(p, d) => renderRightActions(p, d, item)}
        overshootRight={false}
        friction={Platform.OS === 'android' ? 3 : 2}
        rightThreshold={Platform.OS === 'android' ? 60 : 40}
        onSwipeableWillOpen={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      >
        <TouchableOpacity
          style={styles.card}
          onPress={() => { if (onGoToSpot) { onGoToSpot(spot); onClose(); } }}
          activeOpacity={0.75}
        >
          <View style={styles.cardLeft}>
            <Text style={styles.cardName} numberOfLines={2}>{spot.name}</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: badgeColor(spot) }]}>
                <Text style={styles.badgeText}>{ccLabel(spot.maxCC)}</Text>
              </View>
              {spot.isFree === true && (
                <View style={[styles.badge, { backgroundColor: C.green }]}>
                  <Text style={styles.badgeText}>無料</Text>
                </View>
              )}
            </View>
            {spot.address && <Text style={styles.cardMeta} numberOfLines={1}>{spot.address}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={16} color={C.sub} />
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Ionicons name="heart" size={18} color={C.pink} />
          <Text style={styles.title}>お気に入り ({items.filter((i) => i.spot).length})</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>閉じる</Text>
          </TouchableOpacity>
        </View>
        {items.filter((i) => i.spot).length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="heart-outline" size={48} color={C.pink} />
            <Text style={styles.emptyText}>お気に入りスポットがまだありません</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.key}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 40 }}
            style={{ flex: 1 }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  title: { color: C.text, fontSize: FontSize.lg, fontWeight: '700', flex: 1 },
  closeBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  closeText: { color: C.blue, fontSize: 15, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  emptyText: { color: C.sub, fontSize: FontSize.md },
  card: {
    backgroundColor: C.card,
    marginHorizontal: Spacing.md, marginVertical: 3,
    borderRadius: 12, padding: Spacing.md,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  cardLeft: { flex: 1, gap: 4 },
  cardName: { color: C.text, fontSize: FontSize.md, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', gap: 4 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  cardMeta: { color: C.sub, fontSize: 11 },
  swipeRight: {
    backgroundColor: C.red,
    justifyContent: 'center', alignItems: 'center',
    width: 72, marginVertical: 3,
    borderTopRightRadius: 12, borderBottomRightRadius: 12,
    marginRight: Spacing.md,
  },
  swipeLabel: { color: '#fff', fontSize: 10, fontWeight: '600', marginTop: 2 },
});
