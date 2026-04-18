/**
 * RiderScreen v5 — 足跡地図 + ライダーノート + 日記タイムライン
 *
 * 上部: 愛車写真付きHeroカード
 * 中部: 足跡マップ + ライダーノート（写真ギャラリー）
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
  Image,
  FlatList,
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
  type Footprint,
} from '../db/database';
import { fetchUserPhotos } from '../firebase/firestoreService';
import { useUser } from '../contexts/UserContext';
import { SpotsListModal } from './SpotsListModal';
import { ParkingPin, Vehicle, Review } from '../types';
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
  parked: { icon: 'camera', color: C.green, label: 'をワンショット' },
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

function formatCoarseTime(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return '今日';
  if (days === 1) return '昨日';
  if (days < 7) return '今週';
  if (days < 30) return '今月';
  return `${Math.ceil(days / 30)}か月前`;
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
  onOpenSettings?: () => void;
  nickname?: string;
  onChangeNickname?: (name: string) => void;
}

export function RiderScreen({ onGoToSpot, onDataChanged, onOpenMyBike, onOpenSettings, nickname, onChangeNickname }: Props) {
  const user = useUser();
  const [bike, setBike] = useState<Vehicle | null>(null);
  const [footprints, setFootprints] = useState<Footprint[]>([]);
  const [uniqueLocations, setUniqueLocations] = useState<Footprint[]>([]);
  const [myPhotos, setMyPhotos] = useState<Review[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [spotsModalOpen, setSpotsModalOpen] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);

  const loadData = useCallback(async () => {
    const [vehicle, fp, uloc] = await Promise.all([
      getFirstVehicle(),
      getFootprints(50),
      getUniqueFootprintLocations(),
    ]);
    setBike(vehicle);
    setFootprints(fp);
    setUniqueLocations(uloc);

    // ライダーノート（写真付きレビュー）
    const uid = user?.userId;
    if (uid) {
      try {
        const photos = await fetchUserPhotos(uid);
        setMyPhotos(photos);
      } catch (e) {
        captureError(e, { context: 'fetch_user_photos' });
      }
    }
  }, [user?.userId]);

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

  // spotId → spotName マッピング（写真にスポット名を表示するため）
  const spotNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const fp of footprints) map.set(fp.spotId, fp.spotName);
    return map;
  }, [footprints]);

  // インパクトメッセージ
  const impactMessage = (() => {
    const count = uniqueLocations.length;
    if (count === 0) return '最初の足跡を刻もう — スポットに行って記録するだけ';
    return `${count}か所に足跡を残した`;
  })();

  const visiblePhotos = showAllPhotos ? myPhotos : myPhotos.slice(0, 5);

  return (
    <View style={s.safe}>
      {/* ── ヘッダーバー ─────────────────────────────── */}
      <View style={s.headerBar}>
        <Text style={s.headerTitle}>ライダーノート</Text>
        {onOpenSettings && (
          <TouchableOpacity
            onPress={onOpenSettings}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={s.settingsBtn}
          >
            <Ionicons name="settings-outline" size={24} color={C.text} />
          </TouchableOpacity>
        )}
      </View>

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

        {/* ── 2. ワンショットカード（メインコンテンツ） ── */}
        <Text style={s.sectionTitle}>ワンショット</Text>
        {myPhotos.length === 0 ? (
          <View style={s.emptyActivity}>
            <Ionicons name="camera" size={24} color={C.accent} />
            <Text style={s.emptyText}>ワンショットで最初の1枚を撮ろう</Text>
          </View>
        ) : (
          <>
            {visiblePhotos.map((item) => (
              <TouchableOpacity
                key={`os_${item.firestoreId ?? item.id}`}
                style={s.oneshotCard}
                activeOpacity={0.8}
                onPress={() => {
                  onGoToSpot?.({
                    id: item.spotId,
                    name: spotNameMap.get(item.spotId) ?? '',
                    latitude: 0,
                    longitude: 0,
                    source: 'seed',
                  } as ParkingPin);
                }}
              >
                <Image source={{ uri: item.photoUri! }} style={s.oneshotPhoto} />
                <View style={s.oneshotInfo}>
                  <Text style={s.oneshotSpotName} numberOfLines={1}>
                    {spotNameMap.get(item.spotId) ?? item.spotId}
                  </Text>
                  <Text style={s.oneshotTime}>{formatCoarseTime(item.createdAt)}</Text>
                  <View style={s.aiBadge}>
                    <Ionicons name="sparkles" size={10} color={C.accent} />
                    <Text style={s.aiBadgeText}>AI分析</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={14} color={C.sub} />
              </TouchableOpacity>
            ))}
            {!showAllPhotos && myPhotos.length > 5 && (
              <TouchableOpacity style={s.showMoreBtn} onPress={() => setShowAllPhotos(true)} activeOpacity={0.7}>
                <Text style={s.showMoreText}>もっと見る（残り{myPhotos.length - 5}件）</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ── 3. 足跡サマリー ─────────────────────── */}
        <View style={s.footprintSummary}>
          <View style={s.impactRow}>
            <Ionicons name="footsteps" size={16} color={C.accent} />
            <Text style={s.impactText}>{impactMessage}</Text>
          </View>
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
                const fStyle = FOOTPRINT_STYLE[fp.type] ?? FOOTPRINT_STYLE.parked;
                return (
                  <Marker
                    key={fp.id}
                    coordinate={{ latitude: fp.latitude, longitude: fp.longitude }}
                    tracksViewChanges={false}
                  >
                    <View style={[s.markerDot, { backgroundColor: fStyle.color }]}>
                      <Ionicons name={fStyle.icon} size={12} color="#fff" />
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

            {uniqueLocations.length > 0 && (
              <View style={s.mapBadge}>
                <Text style={s.mapBadgeText}>{uniqueLocations.length}か所</Text>
              </View>
            )}
          </View>
        </View>

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
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
  },
  settingsBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
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
  heroBg: { width: '100%', height: 160 },
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
    paddingHorizontal: 16, paddingVertical: 12,
  },
  impactText: { color: C.accent, fontSize: 14, fontWeight: '700', flex: 1, lineHeight: 20 },

  // ── Parking Active Card ──
  // ── Footprint Map ──
  mapContainer: {
    overflow: 'hidden',
    height: 120,
    backgroundColor: C.card,
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

  // ── My Notes (Photos) ──
  noteList: { paddingHorizontal: 16, gap: 10, marginBottom: 24 },
  noteCard: {
    width: 140, borderRadius: 12, overflow: 'hidden',
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  notePhoto: { width: 140, height: 100 },
  noteInfo: { padding: 8, gap: 2 },
  noteSpotName: { color: C.text, fontSize: 12, fontWeight: '600' },
  noteDate: { color: C.sub, fontSize: 10 },

  // ── Oneshot Cards ──
  emptyActivity: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyText: { color: C.sub, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  oneshotCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 10,
    padding: 10,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  oneshotPhoto: { width: 80, height: 80, borderRadius: 10 },
  oneshotInfo: { flex: 1, gap: 4 },
  oneshotSpotName: { color: C.text, fontSize: 14, fontWeight: '600' },
  oneshotTime: { color: C.sub, fontSize: 12 },
  aiBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(255,107,0,0.3)',
    opacity: 0.4,
  },
  aiBadgeText: { color: C.accent, fontSize: 10, fontWeight: '600' },
  showMoreBtn: {
    alignItems: 'center', paddingVertical: 12,
    marginHorizontal: 16,
  },
  showMoreText: { color: C.blue, fontSize: 13, fontWeight: '600' },

  // ── Footprint Summary ──
  footprintSummary: {
    marginHorizontal: 16, marginTop: 24,
    backgroundColor: C.card,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
});
