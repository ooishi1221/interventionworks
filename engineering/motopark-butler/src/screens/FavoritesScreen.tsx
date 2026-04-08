import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { Favorite, ParkingPin } from '../types';
import { getAllFavorites, removeFavorite, getAllUserSpots } from '../db/database';
import { ADACHI_PARKING } from '../data/adachi-parking';

interface Props {
  onGoToMap: () => void;
  onGoToSpot: (spot: ParkingPin) => void;
}

interface FavoriteItem {
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
  if (spot.source === 'user') return '#9C27B0';
  if (spot.maxCC === null) return '#FF6B00';
  if (spot.maxCC >= 250)   return '#4CAF50';
  if (spot.maxCC >= 125)   return '#2196F3';
  return '#9E9E9E';
}

export function FavoritesScreen({ onGoToMap, onGoToSpot }: Props) {
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);

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

        return { favorite: fav, spot };
      });

      setItems(resolved);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRemove = (item: FavoriteItem) => {
    const name = item.spot?.name ?? '不明なスポット';
    Alert.alert('お気に入りを解除', `「${name}」をお気に入りから削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await removeFavorite(item.favorite.spotId, item.favorite.source);
          await load();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>♥ お気に入り</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.accent} size="large" />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>♡</Text>
          <Text style={styles.emptyText}>お気に入りがありません</Text>
          <Text style={styles.emptyHint}>地図で駐輪場をタップして♡ボタンで追加できます</Text>
          <TouchableOpacity style={styles.goMapBtn} onPress={onGoToMap}>
            <Text style={styles.goMapBtnText}>地図を見る →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.count}>{items.length}件</Text>
          {items.map((item) =>
            item.spot ? (
              <FavoriteCard
                key={item.favorite.id}
                item={item}
                onTap={() => onGoToSpot(item.spot!)}
                onRemove={() => handleRemove(item)}
              />
            ) : null
          )}
          <View style={{ height: Spacing.xxl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function FavoriteCard({
  item,
  onTap,
  onRemove,
}: {
  item: FavoriteItem;
  onTap: () => void;
  onRemove: () => void;
}) {
  const spot = item.spot!;
  return (
    <TouchableOpacity style={styles.card} onPress={onTap} activeOpacity={0.75}>
      <View style={styles.cardLeft}>
        <Text style={styles.cardName} numberOfLines={2}>{spot.name}</Text>

        <View style={styles.badgeRow}>
          {spot.source === 'user' && (
            <View style={[styles.badge, { backgroundColor: '#9C27B0' }]}>
              <Text style={styles.badgeText}>ユーザー</Text>
            </View>
          )}
          <View style={[styles.badge, { backgroundColor: badgeColor(spot) }]}>
            <Text style={styles.badgeText}>{ccLabel(spot.maxCC)}</Text>
          </View>
          {spot.isFree === true && (
            <View style={[styles.badge, { backgroundColor: Colors.success }]}>
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
        <Text style={styles.cardHint}>タップして地図で表示</Text>
      </View>

      <TouchableOpacity style={styles.removeBtn} onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.removeBtnIcon}>♥</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { color: Colors.text, fontSize: FontSize.lg, fontWeight: 'bold' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  emptyIcon: { fontSize: 64, color: '#E91E63' },
  emptyText: { color: Colors.text, fontSize: FontSize.md, fontWeight: '600' },
  emptyHint: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center' },
  goMapBtn: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  goMapBtnText: { color: Colors.white, fontSize: FontSize.md, fontWeight: '700' },
  list: { padding: Spacing.lg, gap: Spacing.sm },
  count: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: Spacing.sm },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  cardLeft: { flex: 1, gap: Spacing.xs },
  cardName: { color: Colors.text, fontSize: FontSize.md, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full },
  badgeMuted: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  badgeText: { color: Colors.white, fontSize: FontSize.xs, fontWeight: '700' },
  badgeTextMuted: { color: Colors.textSecondary, fontSize: FontSize.xs },
  cardMeta: { color: Colors.textSecondary, fontSize: FontSize.xs },
  cardHint: { color: Colors.accent, fontSize: FontSize.xs },
  removeBtn: { padding: Spacing.sm, marginLeft: Spacing.sm },
  removeBtnIcon: { fontSize: 26, color: '#E91E63' },
});
