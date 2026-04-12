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
  Alert,
  Modal,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  getAllUserSpots,
  getAllFavorites,
  getStat,
  getExploredPrefectures,
  getRecentActivity,
  type ActivityLogEntry,
} from '../db/database';
import { getMyReviewCount } from '../firebase/firestoreService';
import { useUser } from '../contexts/UserContext';
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

// ─── 次の目標カード ──────────────────────────────────
function NextGoalCard({ contribution, rank }: { contribution: number; rank: { name: string; color: string; next: string; progress: number } }) {
  if (!rank.next) {
    return (
      <View style={[styles.goalCard, { borderColor: `${rank.color}44` }]}>
        <Ionicons name="trophy" size={24} color={rank.color} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.goalTitle, { color: rank.color }]}>最高ランク達成!</Text>
          <Text style={styles.goalSub}>あなたは地図の守護者です。これからも仲間を支えよう。</Text>
        </View>
      </View>
    );
  }

  const GOALS = [
    { rank: 'ライダー', threshold: 5, icon: 'bicycle' as const },
    { rank: 'パトロール', threshold: 20, icon: 'shield-checkmark' as const },
  ];
  const nextGoal = GOALS.find((g) => g.rank === rank.next.split(' ')[0]) ?? GOALS[0];
  const remaining = nextGoal.threshold - contribution;

  return (
    <View style={[styles.goalCard, { borderColor: `${rank.color}44` }]}>
      <Ionicons name={nextGoal.icon} size={22} color={rank.color} />
      <View style={{ flex: 1 }}>
        <Text style={styles.goalTitle}>
          あと <Text style={{ color: rank.color, fontWeight: '800' }}>{remaining}件</Text> の貢献で
          <Text style={{ color: rank.color }}> {nextGoal.rank}</Text> に昇格!
        </Text>
        <View style={styles.goalBar}>
          <View style={[styles.goalFill, { width: `${Math.min(rank.progress * 100, 100)}%`, backgroundColor: rank.color }]} />
        </View>
      </View>
    </View>
  );
}

// ─── 最近の活動タイムライン ───────────────────────────

const ACTIVITY_ICON: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  spot:     { icon: 'location',        color: C.purple },
  review:   { icon: 'chatbubble',      color: C.blue },
  report:   { icon: 'checkmark-circle', color: C.green },
  favorite: { icon: 'heart',           color: C.pink },
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  const d = Math.floor(hr / 24);
  return `${d}日前`;
}

function RecentActivity({ entries }: { entries: ActivityLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <View style={styles.activitySection}>
        <Text style={styles.sectionTitle}>あなたの活動</Text>
        <View style={styles.activityItem}>
          <View style={[styles.activityDot, { backgroundColor: C.orange }]}>
            <Ionicons name="flag" size={14} color="#fff" />
          </View>
          <Text style={styles.activityText}>マップでスポットを共有して{'\n'}あなたの活動を始めよう</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.activitySection}>
      <Text style={styles.sectionTitle}>あなたの活動</Text>
      {entries.map((entry, i) => {
        const meta = ACTIVITY_ICON[entry.type] ?? ACTIVITY_ICON.report;
        return (
          <View key={entry.id} style={styles.activityItem}>
            <View style={[styles.activityDot, { backgroundColor: meta.color }]}>
              <Ionicons name={meta.icon} size={14} color="#fff" />
            </View>
            {i < entries.length - 1 && <View style={styles.activityLine} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.activityText}>{entry.label}</Text>
              <Text style={styles.activityTime}>{formatRelative(entry.createdAt)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

interface Props {
  onGoToSpot?: (spot: ParkingPin) => void;
  onDataChanged?: () => void;
  onStartTutorial?: () => void;
  nickname?: string;
  onChangeNickname?: (name: string) => void;
}

export function RiderScreen({ onGoToSpot, onDataChanged, onStartTutorial, nickname, onChangeNickname }: Props) {
  const user = useUser();
  const [stats, setStats] = useState<RiderStats>({ spotsShared: 0, reviews: 0, reports: 0, favorites: 0, areas: 0, helpedRiders: 0 });
  const [favModalOpen, setFavModalOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [spotsModalOpen, setSpotsModalOpen] = useState(false);
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);
  const [activityEntries, setActivityEntries] = useState<ActivityLogEntry[]>([]);

  const loadStats = useCallback(async () => {
    const [spots, reviews, reports, favs, areas, recentActs] = await Promise.all([
      getAllUserSpots(),
      user ? getMyReviewCount(user.userId) : Promise.resolve(0),
      getStat('reports'),
      getAllFavorites(),
      getExploredPrefectures(),
      getRecentActivity(10),
    ]);
    setActivityEntries(recentActs);
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

        {/* ── ヘッダー（ニックネーム + ランクアイコン） ── */}
        <View style={styles.header}>
          <View style={[styles.avatarCircle, { borderColor: `${rank.color}55` }]}>
            <MaterialCommunityIcons name="motorbike" size={36} color={rank.color} />
          </View>
          <TouchableOpacity
            onPress={() => {
              Alert.prompt?.(
                'ニックネーム変更',
                '新しいニックネームを入力',
                (text: string) => { if (text.trim() && onChangeNickname) onChangeNickname(text.trim()); },
                'plain-text',
                nickname ?? '',
              ) ?? Alert.alert('ニックネーム変更', '設定画面から変更できます');
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.title}>{nickname || 'ライダー'}</Text>
          </TouchableOpacity>
          <Text style={styles.subtitle}>{rank.name} — Moto-Logos</Text>
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

        {/* ── 次の目標 ──────────────────────────────── */}
        <NextGoalCard contribution={contribution} rank={rank} />

        {/* ── 最近の活動 ─────────────────────────────── */}
        <RecentActivity entries={activityEntries} />

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

  // 次の目標
  goalCard: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: Spacing.lg,
    borderWidth: 1,
  },
  goalTitle: { color: C.text, fontSize: 14, fontWeight: '600', lineHeight: 22 },
  goalSub: { color: C.sub, fontSize: 12, marginTop: 4 },
  goalBar: {
    height: 5, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginTop: 8,
  },
  goalFill: { height: 5, borderRadius: 3 },

  // 最近の活動
  activitySection: { marginTop: 24 },
  sectionTitle: { color: C.sub, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  activityDot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  activityLine: {
    position: 'absolute',
    left: 13, top: 30,
    width: 2, height: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  activityText: { color: C.text, fontSize: 14 },
  activityTime: { color: C.sub, fontSize: 11, marginTop: 2 },

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
