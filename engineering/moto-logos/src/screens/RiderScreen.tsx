/**
 * RiderScreen v4 — 足跡地図 + 日記タイムライン
 *
 * 上部: 愛車写真付きHeroカード
 * 中部: 足跡マップ（自分が停めた場所にピン）
 * 下部: 日記形式の活動タイムライン
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ImageBackground,
  TextInput,
  Dimensions,
} from 'react-native';
import Constants from 'expo-constants';
import MapView, { Marker, Region } from 'react-native-maps';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  getFirstVehicle,
  getFootprints,
  getUniqueFootprintLocations,
  getActiveParkingSession,
  endParking,
  expireOldParkingSessions,
  type Footprint,
  type ParkingSession,
} from '../db/database';
import { reportDeparted } from '../firebase/firestoreService';
import { SpotsListModal } from './SpotsListModal';
import { ParkingPin, Vehicle } from '../types';
import { DARK_MAP_STYLE } from '../constants/mapStyle';
import { Colors } from '../constants/theme';
import { captureError } from '../utils/sentry';

const { width: SCREEN_W } = Dimensions.get('window');

const C = Colors;

const CC_LABEL: Record<string, string> = {
  '50': '原付',
  '125': '125cc',
  '400': '400cc',
  'null': '大型',
};

// ─── 足跡タイプ別のアイコン/カラー ───────────────────
const FOOTPRINT_STYLE: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  parked: { icon: 'footsteps', color: C.green, label: 'に停めた' },
  full:   { icon: 'alert-circle', color: '#FF453A', label: 'は満車だった' },
  closed: { icon: 'close-circle', color: '#636366', label: 'は閉鎖していた' },
  wrong_price: { icon: 'cash-outline', color: '#FFD60A', label: 'で料金が違った' },
  wrong_cc:    { icon: 'speedometer-outline', color: C.orange, label: 'でCC制限が違った' },
  failed: { icon: 'footsteps-outline', color: C.orange, label: 'で停められなかった' },
};

// ─── 日付フォーマット ────────────────────────────────
function formatDiaryDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function isSameDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}

function formatElapsed(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間${min % 60 > 0 ? `${min % 60}分` : ''}`;
  const d = Math.floor(hr / 24);
  return `${d}日`;
}

// ─── 東京デフォルトリージョン ────────────────────────
const TOKYO_REGION: Region = {
  latitude: 35.6812,
  longitude: 139.7671,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

interface Props {
  onGoToSpot?: (spot: ParkingPin) => void;
  onDataChanged?: () => void;
  onOpenMyBike?: () => void;
  nickname?: string;
  onChangeNickname?: (name: string) => void;
}

export function RiderScreen({ onGoToSpot, onDataChanged, onOpenMyBike, nickname, onChangeNickname }: Props) {
  const [bike, setBike] = useState<Vehicle | null>(null);
  const [footprints, setFootprints] = useState<Footprint[]>([]);
  const [uniqueLocations, setUniqueLocations] = useState<Footprint[]>([]);
  const [activeSession, setActiveSession] = useState<ParkingSession | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [spotsModalOpen, setSpotsModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    // 2h超過セッションを自動出発 (#110)
    const AUTO_DEPART_MS = 2 * 60 * 60 * 1000;
    const expired = await expireOldParkingSessions(AUTO_DEPART_MS);
    for (const s of expired) {
      reportDeparted(s.spotId).catch((e) => captureError(e, { context: 'auto_depart' }));
    }

    const [vehicle, fp, uloc, session] = await Promise.all([
      getFirstVehicle(),
      getFootprints(50),
      getUniqueFootprintLocations(),
      getActiveParkingSession(),
    ]);
    setBike(vehicle);
    setFootprints(fp);
    setUniqueLocations(uloc);
    setActiveSession(session);

  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);


  // 地図のリージョンを足跡から計算
  const mapRegion = useMemo<Region>(() => {
    if (uniqueLocations.length === 0) return TOKYO_REGION;
    if (uniqueLocations.length === 1) {
      return {
        latitude: uniqueLocations[0].latitude,
        longitude: uniqueLocations[0].longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    const lats = uniqueLocations.map((f) => f.latitude);
    const lngs = uniqueLocations.map((f) => f.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.02),
      longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.02),
    };
  }, [uniqueLocations]);

  // バイク情報
  const bikeLabel = bike
    ? [bike.name || bike.manufacturer, bike.year ? `${bike.year}` : null].filter(Boolean).join(' · ')
    : null;
  const ccLabel = bike?.cc !== undefined ? CC_LABEL[String(bike.cc)] : null;

  // インパクトメッセージ
  const impactMessage = (() => {
    const count = uniqueLocations.length;
    if (count === 0) return '最初の足跡を刻もう — スポットに行って記録するだけ';
    return `${count}か所に足跡を残した`;
  })();

  return (
    <View style={s.safe}>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue} />}
      >

        {/* ── 1. ライダーカード（Hero） ─────────────── */}
        <View style={s.heroCard} accessibilityRole="summary" accessibilityLabel="ライダープロフィールカード">
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

          {onOpenMyBike && (
            <TouchableOpacity
              style={s.editBikeBtn}
              onPress={() => { onOpenMyBike(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.7}
              accessibilityLabel={bike ? 'マイバイク編集' : '愛車を登録しよう'}
              accessibilityRole="button"
              accessibilityHint="マイバイクの情報を編集する画面を開きます"
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
          <Ionicons name="footsteps" size={16} color={C.accent} />
          <Text style={s.impactText}>{impactMessage}</Text>
        </View>

        {/* ── 2.5 駐車中カード（表示のみ、出発は自動検知） ── */}
        {activeSession && (
          <View style={s.parkingCard}>
            <View style={s.parkingCardLeft}>
              <View style={s.parkingPulse}>
                <Ionicons name="location" size={18} color={C.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.parkingLabel}>駐車中</Text>
                <Text style={s.parkingSpotName} numberOfLines={1}>{activeSession.spotName}</Text>
                <Text style={s.parkingElapsed}>{formatElapsed(activeSession.startedAt)}経過</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── 3. 足跡マップ ───────────────────────── */}
        <View style={s.mapContainer} accessibilityLabel={`足跡マップ。${uniqueLocations.length}か所に足跡あり`} accessibilityRole="image">
          <MapView
            style={s.map}
            region={mapRegion}
            customMapStyle={DARK_MAP_STYLE}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            pointerEvents="none"
          >
            {uniqueLocations.map((fp) => {
              const style = FOOTPRINT_STYLE[fp.type] ?? FOOTPRINT_STYLE.parked;
              return (
                <Marker
                  key={fp.id}
                  coordinate={{ latitude: fp.latitude, longitude: fp.longitude }}
                  tracksViewChanges={false}
                >
                  <View style={[s.markerDot, { backgroundColor: style.color }]}>
                    <Ionicons name={style.icon} size={12} color="#fff" />
                  </View>
                </Marker>
              );
            })}
          </MapView>

          {uniqueLocations.length === 0 && (
            <View style={s.mapEmptyOverlay}>
              <Ionicons name="map-outline" size={32} color="rgba(255,255,255,0.2)" />
              <Text style={s.mapEmptyText}>まだ足跡がない</Text>
            </View>
          )}

          {/* 足跡カウント */}
          {uniqueLocations.length > 0 && (
            <View style={s.mapBadge}>
              <Text style={s.mapBadgeText}>{uniqueLocations.length}か所</Text>
            </View>
          )}
        </View>

        {/* ── 4. 日記タイムライン ─────────────────── */}
        <Text style={s.sectionTitle}>足跡日記</Text>
        {footprints.length === 0 ? (
          <View style={s.emptyActivity}>
            <Ionicons name="footsteps" size={24} color={C.accent} />
            <Text style={s.emptyText}>スポットに行って足跡を残そう{'\n'}あなたの軌跡がここに刻まれます</Text>
          </View>
        ) : (
          footprints.map((fp, i) => {
            const showDate = i === 0 || !isSameDay(footprints[i - 1].createdAt, fp.createdAt);
            const style = FOOTPRINT_STYLE[fp.type] ?? FOOTPRINT_STYLE.parked;
            return (
              <View key={fp.id}>
                {showDate && (
                  <Text style={s.diaryDate}>{formatDiaryDate(fp.createdAt)}</Text>
                )}
                <TouchableOpacity
                  style={s.diaryItem}
                  activeOpacity={0.7}
                  onPress={() => {
                    onGoToSpot?.({
                      id: fp.spotId,
                      name: fp.spotName,
                      latitude: fp.latitude,
                      longitude: fp.longitude,
                      source: 'seed',
                    } as ParkingPin);
                  }}
                  accessible
                  accessibilityLabel={`${formatTime(fp.createdAt)}、${fp.spotName}${style.label}。タップでマップに移動`}
                  accessibilityRole="button"
                >
                  <View style={[s.diaryDot, { backgroundColor: style.color }]}>
                    <Ionicons name={style.icon} size={12} color="#fff" />
                  </View>
                  {i < footprints.length - 1 && isSameDay(fp.createdAt, footprints[i + 1]?.createdAt) && (
                    <View style={s.diaryLine} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={s.diaryText}>
                      {fp.spotName}{style.label}
                    </Text>
                    <Text style={s.diaryTime}>{formatTime(fp.createdAt)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={C.sub} />
                </TouchableOpacity>
              </View>
            );
          })
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ── モーダル ─────────────────────────────── */}
      <SpotsListModal
        visible={spotsModalOpen}
        onClose={() => { setSpotsModalOpen(false); loadData(); onDataChanged?.(); }}
        onGoToSpot={onGoToSpot}
      />
    </View>
  );
}

// ─── Heroカード内コンテンツ ──────────────────────────
function HeroContent({ nickname, bikeLabel, ccLabel, tagline, hasPhoto, onChangeNickname }: {
  nickname?: string; bikeLabel: string | null; ccLabel: string | null;
  tagline?: string; hasPhoto?: boolean; onChangeNickname?: (name: string) => void;
}) {
  const [editing, setEditing] = useState(!nickname);
  const [draft, setDraft] = useState(nickname ?? '');

  const submitNickname = useCallback(() => {
    if (draft.trim() && onChangeNickname) {
      onChangeNickname(draft.trim());
    }
    setEditing(false);
  }, [draft, onChangeNickname]);

  return (
    <View style={s.heroInner}>
      {!hasPhoto && (
        <View style={s.avatarCircle}>
          <MaterialCommunityIcons name="motorbike" size={32} color={C.accent} />
        </View>
      )}
      {editing ? (
        <TextInput
          style={s.nicknameInput}
          placeholder="名前つけとく？"
          placeholderTextColor={C.sub}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submitNickname}
          onBlur={submitNickname}
          maxLength={20}
          returnKeyType="done"
          autoFocus
        />
      ) : (
        <TouchableOpacity
          onPress={() => {
            setDraft(nickname ?? '');
            setEditing(true);
          }}
          activeOpacity={0.7}
          accessibilityLabel={`ニックネーム: ${nickname || 'ライダー'}。タップして変更`}
          accessibilityRole="button"
          accessibilityHint="ニックネームを変更するダイアログを開きます"
        >
          <Text style={s.heroName}>{nickname || 'ライダー'}</Text>
        </TouchableOpacity>
      )}
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
  safe: { flex: 1, backgroundColor: C.bg, paddingTop: Constants.statusBarHeight },
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
  heroBg: { width: '100%', height: 220 },
  heroBgImage: { borderRadius: 20 },
  heroOverlay: { flex: 1, justifyContent: 'flex-end', padding: 20 },
  heroNoBg: {
    height: 200,
    justifyContent: 'flex-end',
    padding: 20,
    backgroundColor: C.card,
  },
  heroInner: { alignItems: 'center', gap: 4 },
  avatarCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,107,0,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,107,0,0.3)',
    marginBottom: 6,
  },
  heroName: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  nicknameInput: {
    color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5,
    textAlign: 'center', borderBottomWidth: 1, borderBottomColor: C.accent,
    paddingVertical: 4, minWidth: 160,
  },
  heroBike: { color: C.sub, fontSize: 14, fontWeight: '600', marginTop: 2 },
  heroTagline: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontStyle: 'italic', marginTop: 4 },
  editBikeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
  },
  editBikeText: { color: C.sub, fontSize: 12, fontWeight: '500' },

  // ── Impact Message ──
  impactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 20, marginBottom: 16,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: 'rgba(255,107,0,0.08)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,107,0,0.2)',
  },
  impactText: { color: C.accent, fontSize: 14, fontWeight: '700', flex: 1, lineHeight: 20 },

  // ── Parking Active Card ──
  parkingCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 16,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: 'rgba(48,209,88,0.10)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(48,209,88,0.3)',
  },
  parkingCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  parkingPulse: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(48,209,88,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  parkingLabel: { color: '#30D158', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  parkingSpotName: { color: '#F2F2F7', fontSize: 15, fontWeight: '600', marginTop: 1 },
  parkingElapsed: { color: '#8E8E93', fontSize: 12, marginTop: 2 },

  // ── Footprint Map ──
  mapContainer: {
    marginHorizontal: 16, marginBottom: 24,
    borderRadius: 16, overflow: 'hidden',
    height: 200,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  map: { flex: 1 },
  mapEmptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  mapEmptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 8 },
  mapBadge: {
    position: 'absolute', bottom: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 10,
  },
  mapBadgeText: { color: C.text, fontSize: 12, fontWeight: '700' },
  markerDot: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },

  // ── Section ──
  sectionTitle: {
    color: C.sub, fontSize: 12, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 10, marginLeft: 18,
  },

  // ── Diary Timeline ──
  emptyActivity: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyText: { color: C.sub, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  diaryDate: {
    color: C.text, fontSize: 16, fontWeight: '700',
    marginLeft: 18, marginTop: 16, marginBottom: 8,
  },
  diaryItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    marginBottom: 14, marginHorizontal: 16,
  },
  diaryDot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  diaryLine: {
    position: 'absolute', left: 29, top: 30,
    width: 2, height: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  diaryText: { color: C.text, fontSize: 14, lineHeight: 20 },
  diaryTime: { color: C.sub, fontSize: 11, marginTop: 2 },
});
