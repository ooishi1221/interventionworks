/**
 * RiderScreen v3 — ライダープロフィール + 活動データ
 *
 * 上部: 愛車写真付きHeroカード（ニックネーム + バイク情報）
 * 中部: インパクトメッセージ + 横3列数字サマリー
 * 下部: 活動タイムライン
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
  ImageBackground,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  getAllUserSpots,
  getAllFavorites,
  getStat,
  getRecentActivity,
  getFirstVehicle,
  type ActivityLogEntry,
} from '../db/database';
import { getMySpotsTotalViews } from '../firebase/firestoreService';
import { FavoritesListModal } from './FavoritesListModal';
import { SpotsListModal } from './SpotsListModal';
import { ParkingPin, Vehicle } from '../types';
import { captureError } from '../utils/sentry';

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
  accent: '#FF6B00',
};

const CC_LABEL: Record<string, string> = {
  '50': '原付',
  '125': '125cc',
  '400': '400cc',
  'null': '大型',
};

// ─── 最近の活動タイムライン ───────────────────────────

const ACTIVITY_ICON: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  spot:     { icon: 'location',           color: C.purple },
  review:   { icon: 'chatbubble',         color: C.blue },
  report:   { icon: 'checkmark-circle',   color: C.green },
  favorite: { icon: 'heart',             color: C.pink },
  // 足跡サブタイプ別カラー
  report_good:   { icon: 'thumbs-up',          color: '#30D158' },  // 停めた
  report_full:   { icon: 'alert-circle',       color: '#FF453A' },  // 満車
  report_closed: { icon: 'close-circle',       color: '#636366' },  // 閉鎖
  report_price:  { icon: 'cash-outline',       color: '#FFD60A' },  // 料金違った
  report_cc:     { icon: 'speedometer-outline', color: '#FF9F0A' },  // CC制限違った
  report_bad:    { icon: 'thumbs-down',        color: '#FF9F0A' },  // 停められなかった
};

/** report ラベルからサブタイプを判定 */
function getReportSubtype(label: string): string {
  if (label.includes('停めた') && !label.includes('停められなかった')) return 'report_good';
  if (label.includes('full') || label.includes('満車')) return 'report_full';
  if (label.includes('closed') || label.includes('閉鎖')) return 'report_closed';
  if (label.includes('wrong_price') || label.includes('料金')) return 'report_price';
  if (label.includes('wrong_cc') || label.includes('CC')) return 'report_cc';
  if (label.includes('停められなかった') || label.includes('other')) return 'report_bad';
  return 'report';
}

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
  onOpenMyBike?: () => void;
  nickname?: string;
  onChangeNickname?: (name: string) => void;
}

export function RiderScreen({ onGoToSpot, onDataChanged, onOpenMyBike, nickname, onChangeNickname }: Props) {
  const [spotsCount, setSpotsCount] = useState(0);
  const [reportsCount, setReportsCount] = useState(0);
  const [favsCount, setFavsCount] = useState(0);
  const [totalViews, setTotalViews] = useState(0);
  const [bike, setBike] = useState<Vehicle | null>(null);
  const [activityEntries, setActivityEntries] = useState<ActivityLogEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [favModalOpen, setFavModalOpen] = useState(false);
  const [spotsModalOpen, setSpotsModalOpen] = useState(false);

  const loadStats = useCallback(async () => {
    const [spots, reports, favs, recentActs, vehicle] = await Promise.all([
      getAllUserSpots(),
      getStat('reports'),
      getAllFavorites(),
      getRecentActivity(10),
      getFirstVehicle(),
    ]);
    setSpotsCount(spots.length);
    setReportsCount(reports);
    setFavsCount(favs.length);
    setActivityEntries(recentActs);
    setBike(vehicle);

    const spotIds = spots.map((s) => `user_${s.id}`);
    getMySpotsTotalViews(spotIds).then(setTotalViews).catch((e) => captureError(e, { context: 'rider_total_views' }));
  }, []);

  useEffect(() => { loadStats(); }, [loadStats, favModalOpen, spotsModalOpen]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }, [loadStats]);

  // バイク情報のサマリーテキスト
  const bikeLabel = bike
    ? [bike.name || bike.manufacturer, bike.year ? `${bike.year}` : null].filter(Boolean).join(' · ')
    : null;
  const ccLabel = bike?.cc !== undefined ? CC_LABEL[String(bike.cc)] : null;

  // インパクトメッセージの出し分け
  const impactMessage = (() => {
    if (totalViews > 0) return `あなたの発見が ${totalViews}人 のライダーに届いています`;
    if (spotsCount > 0) return 'あなたが登録したスポット、もうすぐ誰かに届きます';
    if (reportsCount > 0) return `仲間の地図を ${reportsCount}回 最新に保ちました`;
    return '最初の一歩を踏み出そう — マップで + をタップ';
  })();

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue} />}
      >

        {/* ── 1. ライダーカード（Hero） ─────────────── */}
        <View style={s.heroCard}>
          {bike?.photoUrl ? (
            <ImageBackground
              source={{ uri: bike.photoUrl }}
              style={s.heroBg}
              imageStyle={s.heroBgImage}
            >
              <LinearGradient
                colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.85)']}
                style={s.heroOverlay}
              >
                <HeroContent
                  nickname={nickname}
                  bikeLabel={bikeLabel}
                  ccLabel={ccLabel}
                  tagline={bike?.tagline}
                  hasPhoto
                  onChangeNickname={onChangeNickname}
                />
              </LinearGradient>
            </ImageBackground>
          ) : (
            <View style={s.heroNoBg}>
              <HeroContent
                nickname={nickname}
                bikeLabel={bikeLabel}
                ccLabel={ccLabel}
                tagline={bike?.tagline}
                onChangeNickname={onChangeNickname}
              />
            </View>
          )}

          {/* マイバイク編集リンク */}
          {onOpenMyBike && (
            <TouchableOpacity
              style={s.editBikeBtn}
              onPress={() => { onOpenMyBike(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={14} color={C.sub} />
              <Text style={s.editBikeText}>
                {bike ? 'マイバイク編集' : '愛車を登録しよう'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── 2. インパクトメッセージ ──────────────── */}
        <View style={s.impactRow}>
          <View style={s.impactDot} />
          <Text style={s.impactText}>{impactMessage}</Text>
        </View>

        {/* ── 3. 数字サマリー（横3列） ────────────── */}
        <View style={s.statsRow}>
          <TouchableOpacity
            style={s.statItem}
            onPress={() => { setSpotsModalOpen(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            activeOpacity={0.7}
          >
            <Text style={s.statValue}>{spotsCount}</Text>
            <Text style={s.statLabel}>発見</Text>
          </TouchableOpacity>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statValue}>{reportsCount}</Text>
            <Text style={s.statLabel}>足跡</Text>
          </View>
          <View style={s.statDivider} />
          <TouchableOpacity
            style={s.statItem}
            onPress={() => { setFavModalOpen(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            activeOpacity={0.7}
          >
            <Text style={s.statValue}>{favsCount}</Text>
            <Text style={s.statLabel}>保存</Text>
          </TouchableOpacity>
        </View>

        {/* ── 4. 活動タイムライン ─────────────────── */}
        <Text style={s.sectionTitle}>最近の活動</Text>
        {activityEntries.length === 0 ? (
          <View style={s.emptyActivity}>
            <Ionicons name="flag" size={24} color={C.accent} />
            <Text style={s.emptyText}>マップでスポットを共有して{'\n'}あなたの活動を始めよう</Text>
          </View>
        ) : (
          activityEntries.map((entry, i) => {
            const key = entry.type === 'report' ? getReportSubtype(entry.label) : entry.type;
            const meta = ACTIVITY_ICON[key] ?? ACTIVITY_ICON.report;
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

// ─── Heroカード内コンテンツ（写真あり/なしで共有） ──────
function HeroContent({ nickname, bikeLabel, ccLabel, tagline, hasPhoto, onChangeNickname }: {
  nickname?: string; bikeLabel: string | null; ccLabel: string | null;
  tagline?: string; hasPhoto?: boolean; onChangeNickname?: (name: string) => void;
}) {
  return (
    <View style={s.heroInner}>
      {!hasPhoto && (
        <View style={s.avatarCircle}>
          <MaterialCommunityIcons name="motorbike" size={32} color={C.accent} />
        </View>
      )}
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
        <Text style={s.heroName}>{nickname || 'ライダー'}</Text>
      </TouchableOpacity>
      {bikeLabel && (
        <Text style={s.heroBike}>
          {bikeLabel}{ccLabel ? ` · ${ccLabel}` : ''}
        </Text>
      )}
      {tagline ? <Text style={s.heroTagline}>{tagline}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: 20 },

  // ── Hero Card ──
  heroCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  heroBg: {
    width: '100%',
    height: 220,
  },
  heroBgImage: {
    borderRadius: 20,
  },
  heroOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 20,
  },
  heroNoBg: {
    height: 200,
    justifyContent: 'flex-end',
    padding: 20,
    backgroundColor: C.card,
  },
  heroInner: {
    alignItems: 'center',
    gap: 4,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,107,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,107,0,0.3)',
    marginBottom: 6,
  },
  heroName: {
    color: C.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heroBike: {
    color: C.sub,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  heroTagline: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  editBikeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  editBikeText: {
    color: C.sub,
    fontSize: 12,
    fontWeight: '500',
  },

  // ── Impact Message ──
  impactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,107,0,0.08)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,107,0,0.2)',
    gap: 10,
  },
  impactDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.accent,
  },
  impactText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    lineHeight: 20,
  },

  // ── Stats Row ──
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: C.card,
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: C.text,
    fontSize: 26,
    fontWeight: '800',
  },
  statLabel: {
    color: C.sub,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: C.border,
  },

  // ── Section ──
  sectionTitle: {
    color: C.sub,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 18,
  },

  // ── Activity ──
  emptyActivity: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 32,
  },
  emptyText: {
    color: C.sub,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
    marginHorizontal: 16,
  },
  activityDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityLine: {
    position: 'absolute',
    left: 29,
    top: 30,
    width: 2,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  activityText: { color: C.text, fontSize: 14, lineHeight: 20 },
  activityTime: { color: C.sub, fontSize: 11, marginTop: 2 },
});
