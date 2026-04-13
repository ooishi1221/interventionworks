/**
 * ProximityContextCard — 現在地ベースの自動アクション提示カード (#90)
 *
 * ニアバイ（≤50m）: 「停められた👍 / ダメだった👎」→ 1タップ報告
 * スポットなし:     「登録する / 他を探す」
 * 通常:            非表示
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  Linking,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { ParkingPin } from '../types';
import {
  reportSpotGood,
  reportSpotFull,
  reportSpotClosed,
  addReview,
} from '../firebase/firestoreService';
import { incrementStat, logActivityLocal } from '../db/database';
import { captureError } from '../utils/sentry';
import { useUser } from '../contexts/UserContext';
import {
  ProximityState,
  NearbySpotInfo,
  markReported,
} from '../hooks/useProximityState';

// ── カラー ────────────────────────────────────────────
const C = {
  sheet: '#1C1C1E',
  card: '#2C2C2E',
  border: 'rgba(255,255,255,0.10)',
  text: '#F2F2F7',
  sub: '#8E8E93',
  blue: '#0A84FF',
  green: '#30D158',
  red: '#FF453A',
  orange: '#FF9F0A',
  accent: '#FF6B00',
};

type CorrectionType = 'full' | 'closed' | 'wrong_price' | 'wrong_cc' | 'other';

const CORRECTION_OPTIONS: { id: CorrectionType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'full',        label: '満車',      icon: 'time' },
  { id: 'closed',      label: '閉鎖',      icon: 'close-circle' },
  { id: 'wrong_price', label: '料金違う',   icon: 'cash-outline' },
  { id: 'wrong_cc',    label: 'CC制限違う', icon: 'speedometer-outline' },
  { id: 'other',       label: 'その他',     icon: 'ellipsis-horizontal' },
];

// ── Props ─────────────────────────────────────────────
interface Props {
  proximityState: ProximityState;
  getNearbyAlternatives: (excludeId?: string, max?: number) => NearbySpotInfo[];
  onQuickReport: () => void; // FAB と同じ登録フロー
  onSpotUpdated?: () => void; // 報告後に allSpotsRaw を更新
}

// ── 距離フォーマット ──────────────────────────────────
function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

// ── CC ラベル ─────────────────────────────────────────
function ccLabel(maxCC: number | null): string {
  if (maxCC === null) return '制限なし';
  if (maxCC === 50) return '原付のみ';
  if (maxCC === 125) return '〜125cc';
  if (maxCC === 250) return '〜250cc';
  return `〜${maxCC}cc`;
}

// ── メインコンポーネント ──────────────────────────────
export function ProximityContextCard({
  proximityState,
  getNearbyAlternatives,
  onQuickReport,
  onSpotUpdated,
}: Props) {
  const user = useUser();

  // アニメーション
  const slideAnim = useRef(new Animated.Value(200)).current; // 下からスライドイン
  const visible = proximityState.kind !== 'normal';

  // カード内部状態
  const [phase, setPhase] = useState<
    'initial' | 'corrections' | 'thanks' | 'alternatives'
  >('initial');
  const [submitting, setSubmitting] = useState(false);

  // 表示中のスポット（nearby の場合）
  const nearbySpot = proximityState.kind === 'nearby' ? proximityState.nearest : null;

  // 状態変更時にリセット
  useEffect(() => {
    setPhase('initial');
  }, [proximityState.kind, nearbySpot?.spot.id]);

  // スライドイン/アウト
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : 200,
      tension: 120,
      friction: 14,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  // ── 報告: 停められた ────────────────────────────────
  const handleGood = useCallback(async () => {
    if (!nearbySpot || submitting) return;
    const spotId = nearbySpot.spot.id;

    let userId = user?.userId;
    if (!userId) userId = (await AsyncStorage.getItem('moto_logos_device_id')) ?? undefined;
    if (!userId) return;

    setSubmitting(true);
    try {
      await reportSpotGood(spotId);
      await addReview(spotId, userId, 1, undefined, undefined);
      await AsyncStorage.setItem(`vote_${spotId}`, 'matched');
      await markReported(spotId);
      logActivityLocal('report', `${nearbySpot.spot.name}を停められた報告`);
      incrementStat('reports');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase('thanks');
      onSpotUpdated?.();
      // 2秒後にカードを消す（次回の状態判定で normal になる）
      setTimeout(() => setPhase('initial'), 2000);
    } catch (e) {
      captureError(e, { context: 'proximity_report_good' });
    }
    setSubmitting(false);
  }, [nearbySpot, user, submitting, onSpotUpdated]);

  // ── 報告: ダメだった → 理由選択表示 ────────────────
  const handleBad = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase('corrections');
  }, []);

  // ── 報告: 理由選択後に送信 ─────────────────────────
  const submitCorrection = useCallback(async (correction: CorrectionType) => {
    if (!nearbySpot || submitting) return;
    const spotId = nearbySpot.spot.id;

    let userId = user?.userId;
    if (!userId) userId = (await AsyncStorage.getItem('moto_logos_device_id')) ?? undefined;
    if (!userId) return;

    setSubmitting(true);
    try {
      if (correction === 'full') {
        await reportSpotFull(spotId);
      } else if (correction === 'closed') {
        await reportSpotClosed(spotId);
      }
      await addReview(spotId, userId, 0, `[${correction}]`, undefined);
      await AsyncStorage.setItem(`vote_${spotId}`, correction);
      await markReported(spotId);
      logActivityLocal('report', `${nearbySpot.spot.name}を${correction}報告`);
      incrementStat('reports');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      onSpotUpdated?.();
      // 理由送信後 → 「他を探す」リスト表示
      setPhase('alternatives');
    } catch (e) {
      captureError(e, { context: 'proximity_report_bad' });
    }
    setSubmitting(false);
  }, [nearbySpot, user, submitting, onSpotUpdated]);

  // ── 「他を探す」表示 ────────────────────────────────
  const showAlternatives = useCallback(() => {
    setPhase('alternatives');
  }, []);

  // ── ナビ起動 ────────────────────────────────────────
  const openNav = useCallback((spot: ParkingPin) => {
    const url = Platform.select({
      ios: `comgooglemaps://?daddr=${spot.latitude},${spot.longitude}&directionsmode=driving`,
      android: `google.navigation:q=${spot.latitude},${spot.longitude}`,
    }) ?? `https://maps.google.com/maps?daddr=${spot.latitude},${spot.longitude}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/maps?daddr=${spot.latitude},${spot.longitude}`),
    );
  }, []);

  // ── 候補リスト ──────────────────────────────────────
  const alternatives = nearbySpot
    ? getNearbyAlternatives(nearbySpot.spot.id, 5)
    : getNearbyAlternatives(undefined, 5);

  if (!visible) return null;

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY: slideAnim }] }]}
      pointerEvents="box-none"
    >
      <View style={styles.card}>
        {/* ── ニアバイ: 初期カード ─────────────────────── */}
        {proximityState.kind === 'nearby' && phase === 'initial' && nearbySpot && (
          <>
            <View style={styles.header}>
              <Ionicons name="location" size={18} color={C.accent} />
              <Text style={styles.spotName} numberOfLines={1}>
                {nearbySpot.spot.name}
              </Text>
            </View>
            <Text style={styles.meta}>
              {formatDistance(nearbySpot.distanceM)}先
              {nearbySpot.spot.maxCC != null && ` · ${ccLabel(nearbySpot.spot.maxCC)}`}
              {nearbySpot.spot.isFree === true && ' · 無料'}
              {nearbySpot.spot.isFree === false && ' · 有料'}
            </Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.goodBtn]}
                onPress={handleGood}
                activeOpacity={0.8}
                disabled={submitting}
              >
                <Ionicons name="thumbs-up" size={22} color="#fff" />
                <Text style={styles.actionText}>停められた</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.badBtn]}
                onPress={handleBad}
                activeOpacity={0.8}
                disabled={submitting}
              >
                <Ionicons name="thumbs-down" size={22} color="#fff" />
                <Text style={styles.actionText}>ダメだった</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── ニアバイ: 理由選択 ──────────────────────── */}
        {proximityState.kind === 'nearby' && phase === 'corrections' && (
          <>
            <Text style={styles.correctionTitle}>何がダメだった？</Text>
            <View style={styles.correctionGrid}>
              {CORRECTION_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={styles.correctionChip}
                  onPress={() => submitCorrection(opt.id)}
                  activeOpacity={0.7}
                  disabled={submitting}
                >
                  <Ionicons name={opt.icon} size={16} color={C.text} />
                  <Text style={styles.correctionChipText}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => setPhase('initial')} style={styles.backLink}>
              <Text style={styles.backText}>戻る</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── ありがとう ──────────────────────────────── */}
        {phase === 'thanks' && (
          <View style={styles.thanksWrap}>
            <Ionicons name="checkmark-circle" size={32} color={C.green} />
            <Text style={styles.thanksText}>ありがとう！情報を更新しました</Text>
          </View>
        )}

        {/* ── スポットなし: 初期カード ─────────────────── */}
        {proximityState.kind === 'no-spots' && phase === 'initial' && (
          <>
            <Text style={styles.noSpotTitle}>この周辺にスポットがありません</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.registerBtn]}
                onPress={onQuickReport}
                activeOpacity={0.8}
              >
                <Ionicons name="camera-outline" size={22} color="#fff" />
                <Text style={styles.actionText}>登録する</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.searchBtn]}
                onPress={showAlternatives}
                activeOpacity={0.8}
              >
                <Ionicons name="navigate-outline" size={22} color="#fff" />
                <Text style={styles.actionText}>他を探す</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── 「他を探す」候補リスト（共通） ──────────── */}
        {phase === 'alternatives' && (
          <>
            <Text style={styles.altTitle}>近くのスポット</Text>
            {alternatives.length === 0 ? (
              <Text style={styles.altEmpty}>近くにスポットが見つかりません</Text>
            ) : (
              alternatives.map((alt) => (
                <TouchableOpacity
                  key={alt.spot.id}
                  style={styles.altRow}
                  onPress={() => openNav(alt.spot)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="location-outline" size={16} color={C.accent} />
                  <Text style={styles.altName} numberOfLines={1}>{alt.spot.name}</Text>
                  <Text style={styles.altDist}>{formatDistance(alt.distanceM)}</Text>
                  <Ionicons name="navigate" size={16} color={C.blue} />
                </TouchableOpacity>
              ))
            )}
            <TouchableOpacity
              onPress={() => setPhase('initial')}
              style={styles.backLink}
            >
              <Text style={styles.backText}>閉じる</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </Animated.View>
  );
}

// ── スタイル ──────────────────────────────────────────
const TAB_BAR_H = Platform.OS === 'android' ? 56 : 82;
const BOTTOM_BASE = TAB_BAR_H + 8;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: BOTTOM_BASE,
    zIndex: 10,
  },
  card: {
    backgroundColor: 'rgba(28,28,30,0.96)',
    borderRadius: 18,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 16,
  },

  // ── ヘッダー（ニアバイ） ───────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  spotName: {
    flex: 1,
    color: C.text,
    fontSize: 17,
    fontWeight: '700',
  },
  meta: {
    color: C.sub,
    fontSize: 13,
    marginBottom: 14,
  },

  // ── ボタン行 ───────────────────────────────────────
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52, // グローブ対応
    borderRadius: 14,
  },
  actionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  goodBtn: {
    backgroundColor: C.green,
  },
  badBtn: {
    backgroundColor: '#48484A',
  },
  registerBtn: {
    backgroundColor: C.accent,
  },
  searchBtn: {
    backgroundColor: '#48484A',
  },

  // ── 理由選択 ───────────────────────────────────────
  correctionTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  correctionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  correctionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#3A3A3C',
  },
  correctionChipText: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },

  // ── ありがとう ─────────────────────────────────────
  thanksWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  thanksText: {
    color: C.green,
    fontSize: 16,
    fontWeight: '700',
  },

  // ── スポットなし ───────────────────────────────────
  noSpotTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
  },

  // ── 候補リスト ─────────────────────────────────────
  altTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  altEmpty: {
    color: C.sub,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
  altRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  altName: {
    flex: 1,
    color: C.text,
    fontSize: 15,
  },
  altDist: {
    color: C.sub,
    fontSize: 13,
    marginRight: 4,
  },

  // ── 共通リンク ─────────────────────────────────────
  backLink: {
    alignSelf: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  backText: {
    color: C.sub,
    fontSize: 14,
  },
});
