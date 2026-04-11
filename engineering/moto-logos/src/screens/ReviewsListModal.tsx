/**
 * ReviewsListModal — 自分の口コミ一覧（削除対応）
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  FlatList,
  Modal,
  Animated as RNAnimated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Spacing, FontSize } from '../constants/theme';
import { Review } from '../types';
import { fetchMyReviews, deleteReviewFromFirestore } from '../firebase/firestoreService';

const C = {
  bg: '#000000', card: '#1C1C1E', border: 'rgba(255,255,255,0.10)',
  text: '#F2F2F7', sub: '#8E8E93', blue: '#0A84FF',
  red: '#FF453A', yellow: '#FFD60A',
};

interface ReviewWithSpot extends Review {
  spotName: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ReviewsListModal({ visible, onClose }: Props) {
  const [reviews, setReviews] = useState<ReviewWithSpot[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const myReviews = await fetchMyReviews();
      setReviews(myReviews);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { if (visible) load(); }, [visible]);

  const handleDelete = (review: ReviewWithSpot) => {
    if (!review.firestoreId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert('口コミを削除', `「${review.spotName}」の口コミを削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => {
          await deleteReviewFromFirestore(review.firestoreId!);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setReviews((prev) => prev.filter((r) => r.firestoreId !== review.firestoreId));
        },
      },
    ]);
  };

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  }

  const renderRightActions = (
    _p: RNAnimated.AnimatedInterpolation<number>,
    dragX: RNAnimated.AnimatedInterpolation<number>,
    item: ReviewWithSpot,
  ) => {
    const scale = dragX.interpolate({ inputRange: [-100, -50, 0], outputRange: [1.1, 1, 0.8], extrapolate: 'clamp' });
    return (
      <TouchableOpacity style={styles.swipeRight} onPress={() => handleDelete(item)}>
        <RNAnimated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
          <Ionicons name="trash" size={22} color="#fff" />
          <Text style={styles.swipeLabel}>削除</Text>
        </RNAnimated.View>
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item }: { item: ReviewWithSpot }) => (
    <Swipeable
      renderRightActions={(p, d) => renderRightActions(p, d, item)}
      overshootRight={false}
      friction={2}
      onSwipeableWillOpen={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
    >
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.spotName} numberOfLines={1}>{item.spotName}</Text>
        </View>
        <View style={styles.starRow}>
          {[1, 2, 3, 4, 5].map((s) => (
            <Ionicons key={s} name={s <= item.score ? 'star' : 'star-outline'} size={14} color={s <= item.score ? C.yellow : 'rgba(255,255,255,0.2)'} />
          ))}
          <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
        </View>
        {item.comment && <Text style={styles.comment} numberOfLines={3}>{item.comment}</Text>}
      </View>
    </Swipeable>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Ionicons name="chatbubble" size={18} color={C.blue} />
          <Text style={styles.title}>口コミ投稿 ({reviews.length})</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>閉じる</Text>
          </TouchableOpacity>
        </View>

        {reviews.length === 0 && !loading ? (
          <View style={styles.empty}>
            <Ionicons name="chatbubble-outline" size={48} color={C.sub} />
            <Text style={styles.emptyText}>口コミ投稿がまだありません</Text>
          </View>
        ) : (
          <FlatList
            data={reviews}
            keyExtractor={(r) => r.firestoreId ?? String(r.id)}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  title: { color: C.text, fontSize: FontSize.lg, fontWeight: '700', flex: 1 },
  closeBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  closeText: { color: C.blue, fontSize: 15, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  emptyText: { color: C.sub, fontSize: FontSize.md },
  card: {
    backgroundColor: C.card,
    marginHorizontal: Spacing.md,
    marginVertical: 3,
    borderRadius: 12,
    padding: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    gap: 6,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spotName: { color: C.text, fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  date: { color: C.sub, fontSize: 11, marginLeft: 8 },
  comment: { color: C.sub, fontSize: 13, lineHeight: 18 },
  swipeRight: { backgroundColor: C.red, justifyContent: 'center', alignItems: 'center', width: 72, marginVertical: 3, borderTopRightRadius: 12, borderBottomRightRadius: 12, marginRight: Spacing.md },
  swipeLabel: { color: '#fff', fontSize: 10, fontWeight: '600', marginTop: 2 },
});
