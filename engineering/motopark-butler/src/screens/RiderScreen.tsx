/**
 * RiderScreen — ライダープロフィール & 6スタッツ
 * スタッツカードタップ → 一覧モーダル遷移
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  getAllUserSpots,
  getAllFavorites,
  getReviewCount,
  getStat,
  getExploredPrefectures,
} from '../db/database';
import { Spacing, FontSize } from '../constants/theme';
import { FavoritesListModal } from './FavoritesListModal';
import { SpotsListModal } from './SpotsListModal';
import { ReviewsListModal } from './ReviewsListModal';
import { ParkingPin } from '../types';

const C = {
  bg:     '#000000',
  card:   '#1C1C1E',
  border: 'rgba(255,255,255,0.10)',
  text:   '#F2F2F7',
  sub:    '#8E8E93',
  blue:   '#0A84FF',
  green:  '#30D158',
  orange: '#FF9F0A',
  purple: '#BF5AF2',
  pink:   '#FF375F',
  red:    '#FF453A',
};

interface RiderStats {
  spotsShared: number;
  reviews: number;
  reports: number;
  favorites: number;
  areas: number;
  helpedRiders: number;
}

function calcRank(total: number) {
  if (total >= 20) return { name: 'パトロール', color: C.orange, icon: 'shield-checkmark' as const, next: '', progress: 1 };
  if (total >= 5)  return { name: 'ライダー', color: C.blue, icon: 'bicycle' as const, next: 'パトロール (20件)', progress: total / 20 };
  return { name: 'ルーキー', color: C.green, icon: 'person' as const, next: 'ライダー (5件)', progress: total / 5 };
}

interface Props {
  onGoToSpot?: (spot: ParkingPin) => void;
  onDataChanged?: () => void;
  onStartTutorial?: () => void;
}

export function RiderScreen({ onGoToSpot, onDataChanged, onStartTutorial }: Props) {
  const [stats, setStats] = useState<RiderStats>({ spotsShared: 0, reviews: 0, reports: 0, favorites: 0, areas: 0, helpedRiders: 0 });
  const [favModalOpen, setFavModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [spotsModalOpen, setSpotsModalOpen] = useState(false);
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);

  const loadStats = useCallback(async () => {
    const [spots, reviews, reports, favs, areas] = await Promise.all([
      getAllUserSpots(),
      getReviewCount(),
      getStat('reports'),
      getAllFavorites(),
      getExploredPrefectures(),
    ]);
    // お気に入りはスポットが存在するもののみカウント
    const userSpotIds = new Set(spots.map((s) => `user_${s.id}`));
    const favorites = favs.filter((f) => {
      if (f.source === 'user') return userSpotIds.has(f.spotId);
      return true; // seed スポットは常に存在
    }).length;
    setStats({
      spotsShared: spots.length,
      reviews,
      reports,
      favorites,
      areas,
      helpedRiders: 0, // 将来 Firestore の viewCount 合計で算出
    });
  }, []);

  // 初回 + モーダルが閉じるたびにスタッツを再取得
  useEffect(() => { loadStats(); }, [loadStats, favModalOpen, spotsModalOpen, reviewsModalOpen]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }, [loadStats]);

  const rank = calcRank(stats.spotsShared + stats.reports);
  const contribution = stats.spotsShared + stats.reviews + stats.reports;

  const STAT_CARDS: { key: string; icon: keyof typeof Ionicons.glyphMap; color: string; value: number | string; label: string; onTap?: () => void }[] = [
    { key: 'spots',   icon: 'location',         color: C.purple, value: stats.spotsShared, label: '共有スポット', onTap: () => { setSpotsModalOpen(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } },
    { key: 'reviews', icon: 'chatbubble',        color: C.blue,   value: stats.reviews,     label: '口コミ投稿', onTap: () => { setReviewsModalOpen(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } },
    { key: 'reports', icon: 'checkmark-circle',  color: C.green,  value: stats.reports,     label: '確認報告' },
    { key: 'favs',    icon: 'heart',             color: C.pink,   value: stats.favorites,   label: 'お気に入り', onTap: () => { setFavModalOpen(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } },
    { key: 'areas',   icon: 'map',               color: C.orange, value: stats.areas || '--', label: '探索エリア' },
    { key: 'helped',  icon: 'people',            color: C.blue,   value: '--',              label: '助けたライダー' },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0A84FF"
          />
        }
      >

        {/* ── ヘッダー ─────────────────────────────── */}
        <View style={styles.header}>
          <View style={[styles.avatarCircle, { borderColor: `${rank.color}55` }]}>
            <MaterialCommunityIcons name="motorbike" size={36} color={rank.color} />
          </View>
          <Text style={styles.title}>Moto-Logos</Text>
          <Text style={styles.subtitle}>Riders' Collective Map</Text>
        </View>

        {/* ── ランクカード ──────────────────────────── */}
        <View style={[styles.rankCard, { borderColor: `${rank.color}44` }]}>
          <View style={styles.rankRow}>
            <Ionicons name={rank.icon} size={24} color={rank.color} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rankName, { color: rank.color }]}>{rank.name}</Text>
              {rank.next ? (
                <Text style={styles.rankNext}>次のランク: {rank.next}</Text>
              ) : (
                <Text style={[styles.rankNext, { color: rank.color }]}>最高ランク達成!</Text>
              )}
            </View>
            <View style={styles.contributionBadge}>
              <Text style={styles.contributionValue}>{contribution}</Text>
              <Text style={styles.contributionLabel}>貢献</Text>
            </View>
          </View>
          {rank.next !== '' && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${Math.min(rank.progress * 100, 100)}%`, backgroundColor: rank.color }]} />
            </View>
          )}
        </View>

        {/* ── 6スタッツ（3x2グリッド） ────────────── */}
        <View style={styles.statsGrid}>
          {STAT_CARDS.map((s) => (
            <TouchableOpacity
              key={s.key}
              style={styles.statCard}
              onPress={s.onTap}
              activeOpacity={s.onTap ? 0.7 : 1}
              disabled={!s.onTap}
            >
              <Ionicons name={s.icon} size={20} color={s.color} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
              {s.onTap && <Ionicons name="chevron-forward" size={12} color={C.sub} style={styles.statArrow} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── コンセプト ───────────────────────────── */}
        <View style={styles.conceptCard}>
          <Text style={styles.conceptTitle}>一人の発見を、全ライダーの安心に。</Text>
          <Text style={styles.conceptBody}>
            あなたが共有したスポットは、次にここを訪れる仲間のライダーを救います。{'\n'}
            走れば走るほど、地図は育つ。みんなで創る集合知地図。
          </Text>
        </View>

        {/* ── ランクシステム ────────────────────────── */}
        <View style={styles.ranksSection}>
          <Text style={styles.sectionTitle}>ランクシステム</Text>
          {[
            { name: 'ルーキー',     desc: 'はじめの一歩',       req: '0件〜', color: C.green,  icon: 'person' as const },
            { name: 'ライダー',     desc: '信頼されるレポーター', req: '5件〜', color: C.blue,   icon: 'bicycle' as const },
            { name: 'パトロール',   desc: '地図の守護者',         req: '20件〜', color: C.orange, icon: 'shield-checkmark' as const },
          ].map((r) => (
            <View key={r.name} style={styles.rankItem}>
              <Ionicons name={r.icon} size={18} color={r.color} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rankItemName, { color: r.color }]}>{r.name}</Text>
                <Text style={styles.rankItemDesc}>{r.desc} — {r.req}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── 使い方を見る ──────────────────────────── */}
        {onStartTutorial && (
          <TouchableOpacity style={styles.tutorialBtn} onPress={onStartTutorial} activeOpacity={0.7}>
            <Ionicons name="help-circle-outline" size={18} color={C.sub} />
            <Text style={styles.tutorialBtnText}>使い方を見る</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ── お気に入りモーダル ─────────────────────── */}
      <FavoritesListModal
        visible={favModalOpen}
        onClose={() => { setFavModalOpen(false); loadStats(); }}
        onGoToSpot={onGoToSpot}
      />
      <SpotsListModal
        visible={spotsModalOpen}
        onClose={() => { setSpotsModalOpen(false); loadStats(); onDataChanged?.(); }}
        onGoToSpot={onGoToSpot}
      />
      <ReviewsListModal
        visible={reviewsModalOpen}
        onClose={() => { setReviewsModalOpen(false); loadStats(); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { padding: Spacing.lg },

  header: { alignItems: 'center', gap: 6, marginBottom: 20 },
  avatarCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
    marginBottom: 4,
  },
  title: { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: C.sub, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },

  rankCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: Spacing.lg,
    borderWidth: 1,
    gap: 12,
  },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankName: { fontSize: 18, fontWeight: '800' },
  rankNext: { color: C.sub, fontSize: 12, marginTop: 2 },
  contributionBadge: { alignItems: 'center' },
  contributionValue: { color: C.text, fontSize: 22, fontWeight: '800' },
  contributionLabel: { color: C.sub, fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  progressBar: {
    height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3 },

  // 3x2 グリッド
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  statCard: {
    width: '31%',
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    flexGrow: 1,
  },
  statValue: { color: C.text, fontSize: 22, fontWeight: '800' },
  statLabel: { color: C.sub, fontSize: 10, fontWeight: '600' },
  statArrow: { position: 'absolute', top: 8, right: 8 },

  conceptCard: {
    marginTop: 20,
    backgroundColor: 'rgba(10,132,255,0.08)',
    borderRadius: 14,
    padding: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(10,132,255,0.2)',
    gap: 8,
  },
  conceptTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
  conceptBody: { color: C.sub, fontSize: 13, lineHeight: 20 },

  ranksSection: { marginTop: 24, gap: 10 },
  sectionTitle: { color: C.sub, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  rankItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  rankItemName: { fontSize: 14, fontWeight: '700' },
  rankItemDesc: { color: C.sub, fontSize: 11 },

  tutorialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  tutorialBtnText: { color: C.sub, fontSize: 14, fontWeight: '600' },
});
