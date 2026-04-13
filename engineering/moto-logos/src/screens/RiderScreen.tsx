/**
 * RiderScreen v2 — 貢献ダッシュボード
 *
 * ランクシステム廃止 → 発見(新規スポット)と更新(報告)の2軸で
 * 「誰に届いたか」を可視化。ポイントで釣らず、事実を返す。
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
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  getAllUserSpots,
  getAllFavorites,
  getStat,
  getRecentActivity,
  type ActivityLogEntry,
} from '../db/database';
import { getMySpotsTotalViews } from '../firebase/firestoreService';
import { useUser } from '../contexts/UserContext';
import { Spacing } from '../constants/theme';
import { FavoritesListModal } from './FavoritesListModal';
import { SpotsListModal } from './SpotsListModal';
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
};

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

interface Props {
  onGoToSpot?: (spot: ParkingPin) => void;
  onDataChanged?: () => void;
  onStartTutorial?: () => void;
  onOpenMyBike?: () => void;
  nickname?: string;
  onChangeNickname?: (name: string) => void;
}

export function RiderScreen({ onGoToSpot, onDataChanged, onStartTutorial, onOpenMyBike, nickname, onChangeNickname }: Props) {
  const user = useUser();
  const [spotsCount, setSpotsCount] = useState(0);
  const [reportsCount, setReportsCount] = useState(0);
  const [favsCount, setFavsCount] = useState(0);
  const [totalViews, setTotalViews] = useState(0);
  const [activityEntries, setActivityEntries] = useState<ActivityLogEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [favModalOpen, setFavModalOpen] = useState(false);
  const [spotsModalOpen, setSpotsModalOpen] = useState(false);

  const loadStats = useCallback(async () => {
    const [spots, reports, favs, recentActs] = await Promise.all([
      getAllUserSpots(),
      getStat('reports'),
      getAllFavorites(),
      getRecentActivity(10),
    ]);
    setSpotsCount(spots.length);
    setReportsCount(reports);
    setFavsCount(favs.length);
    setActivityEntries(recentActs);

    // 自分のスポットの合計閲覧数を取得
    const spotIds = spots.map((s) => `user_${s.id}`);
    getMySpotsTotalViews(spotIds).then(setTotalViews).catch(() => {});
  }, []);

  useEffect(() => { loadStats(); }, [loadStats, favModalOpen, spotsModalOpen]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }, [loadStats]);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue} />}
      >

        {/* ── ヘッダー ──────────────────────────── */}
        <View style={s.header}>
          <View style={s.avatarCircle}>
            <MaterialCommunityIcons name="motorbike" size={36} color={C.orange} />
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
            <Text style={s.title}>{nickname || 'ライダー'}</Text>
          </TouchableOpacity>
          <Text style={s.subtitle}>Moto-Logos</Text>
        </View>

        {/* ── 貢献ダッシュボード（発見 / 更新） ── */}
        <Text style={s.sectionTitle}>あなたの貢献</Text>

        {/* 発見（新規スポット登録） */}
        <TouchableOpacity
          style={s.contribCard}
          onPress={() => { setSpotsModalOpen(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          activeOpacity={0.7}
        >
          <View style={s.contribHeader}>
            <View style={[s.contribIcon, { backgroundColor: 'rgba(191,90,242,0.15)' }]}>
              <Ionicons name="telescope" size={20} color={C.purple} />
            </View>
            <Text style={s.contribLabel}>発見</Text>
            <Ionicons name="chevron-forward" size={14} color={C.sub} />
          </View>
          <View style={s.contribStats}>
            <View style={s.contribStat}>
              <Text style={s.contribValue}>{spotsCount}</Text>
              <Text style={s.contribUnit}>スポット登録</Text>
            </View>
            <View style={s.contribDivider} />
            <View style={s.contribStat}>
              <Text style={s.contribValue}>{totalViews}</Text>
              <Text style={s.contribUnit}>人が閲覧</Text>
            </View>
          </View>
          {totalViews > 0 && (
            <Text style={s.contribImpact}>
              あなたの発見が {totalViews}人 のライダーに届いています
            </Text>
          )}
        </TouchableOpacity>

        {/* 更新（報告） */}
        <View style={s.contribCard}>
          <View style={s.contribHeader}>
            <View style={[s.contribIcon, { backgroundColor: 'rgba(48,209,88,0.15)' }]}>
              <Ionicons name="shield-checkmark" size={20} color={C.green} />
            </View>
            <Text style={s.contribLabel}>更新</Text>
          </View>
          <View style={s.contribStats}>
            <View style={s.contribStat}>
              <Text style={s.contribValue}>{reportsCount}</Text>
              <Text style={s.contribUnit}>件の報告</Text>
            </View>
          </View>
          {reportsCount > 0 && (
            <Text style={s.contribImpact}>
              仲間の情報を最新に保っています
            </Text>
          )}
        </View>

        {/* ── マイバイク ──────────────────────────── */}
        {onOpenMyBike && (
          <TouchableOpacity
            style={s.miniCard}
            onPress={() => { onOpenMyBike(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="motorbike" size={18} color={C.orange} />
            <Text style={s.miniLabel}>マイバイク</Text>
            <Ionicons name="chevron-forward" size={14} color={C.sub} />
          </TouchableOpacity>
        )}

        {/* ── お気に入り ─────────────────────────── */}
        <TouchableOpacity
          style={s.miniCard}
          onPress={() => { setFavModalOpen(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          activeOpacity={0.7}
        >
          <Ionicons name="heart" size={18} color={C.pink} />
          <Text style={s.miniLabel}>お気に入り</Text>
          <Text style={s.miniValue}>{favsCount}</Text>
          <Ionicons name="chevron-forward" size={14} color={C.sub} />
        </TouchableOpacity>

        {/* ── 最近の活動 ─────────────────────────── */}
        <Text style={[s.sectionTitle, { marginTop: 24 }]}>最近の活動</Text>
        {activityEntries.length === 0 ? (
          <View style={s.emptyActivity}>
            <Ionicons name="flag" size={24} color={C.orange} />
            <Text style={s.emptyText}>マップでスポットを共有して{'\n'}あなたの活動を始めよう</Text>
          </View>
        ) : (
          activityEntries.map((entry, i) => {
            const meta = ACTIVITY_ICON[entry.type] ?? ACTIVITY_ICON.report;
            return (
              <View key={entry.id} style={s.activityItem}>
                <View style={[s.activityDot, { backgroundColor: meta.color }]}>
                  <Ionicons name={meta.icon} size={14} color="#fff" />
                </View>
                {i < activityEntries.length - 1 && <View style={s.activityLine} />}
                <View style={{ flex: 1 }}>
                  <Text style={s.activityText}>{entry.label}</Text>
                  <Text style={s.activityTime}>{formatRelative(entry.createdAt)}</Text>
                </View>
              </View>
            );
          })
        )}

        {/* ── 使い方を見る ──────────────────────── */}
        {onStartTutorial && (
          <TouchableOpacity style={s.tutorialBtn} onPress={onStartTutorial} activeOpacity={0.7}>
            <Ionicons name="help-circle-outline" size={18} color={C.sub} />
            <Text style={s.tutorialBtnText}>使い方を見る</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ── モーダル ─────────────────────────────── */}
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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { padding: Spacing.lg },

  // Header
  header: { alignItems: 'center', gap: 6, marginBottom: 24 },
  avatarCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: C.card, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,107,0,0.3)', marginBottom: 4,
  },
  title: { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: C.sub, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },

  // Section
  sectionTitle: { color: C.sub, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginLeft: 2 },

  // Contribution card
  contribCard: {
    backgroundColor: C.card, borderRadius: 16, padding: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, marginBottom: 10,
  },
  contribHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  contribIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  contribLabel: { color: C.text, fontSize: 16, fontWeight: '700', flex: 1 },
  contribStats: { flexDirection: 'row', alignItems: 'center' },
  contribStat: { flex: 1, alignItems: 'center' },
  contribValue: { color: C.text, fontSize: 28, fontWeight: '800' },
  contribUnit: { color: C.sub, fontSize: 11, fontWeight: '600', marginTop: 2 },
  contribDivider: { width: 1, height: 32, backgroundColor: C.border },
  contribImpact: { color: C.orange, fontSize: 12, fontWeight: '600', marginTop: 12, textAlign: 'center' },

  // Mini card (favorites)
  miniCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.card, borderRadius: 14, padding: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, marginTop: 6,
  },
  miniLabel: { color: C.text, fontSize: 15, fontWeight: '600', flex: 1 },
  miniValue: { color: C.text, fontSize: 18, fontWeight: '800' },

  // Activity
  emptyActivity: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyText: { color: C.sub, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  activityItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  activityDot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  activityLine: {
    position: 'absolute', left: 13, top: 30, width: 2, height: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  activityText: { color: C.text, fontSize: 14, lineHeight: 20 },
  activityTime: { color: C.sub, fontSize: 11, marginTop: 2 },

  // Tutorial
  tutorialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 24, paddingVertical: 12,
  },
  tutorialBtnText: { color: C.sub, fontSize: 13 },
});
