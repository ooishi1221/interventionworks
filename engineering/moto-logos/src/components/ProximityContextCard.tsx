/**
 * ProximityContextCard — 現在地ベースの足跡カード (#90)
 *
 * ニアバイ（≤50m）: 「ここに停めた？ / 停められなかった？」→ 足跡を残す
 * スポットなし:     「新しい場所を見つけた？ / 他を探す」
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
import { usePhotoPicker } from '../hooks/usePhotoPicker';
import {
  reportSpotGood,
  reportParked,
  addReview,
} from '../firebase/firestoreService';
import { incrementStat, logActivityLocal, getFirstVehicle, addFootprint } from '../db/database';
import { captureError } from '../utils/sentry';
import { useUser } from '../contexts/UserContext';
import { useTutorial } from '../contexts/TutorialContext';
import {
  ProximityState,
  NearbySpotInfo,
  markReported,
} from '../hooks/useProximityState';

// ── カラー（card = cardElevated: #2C2C2E） ──────────
import { Colors } from '../constants/theme';
const C = { ...Colors, card: Colors.cardElevated };

// ── Props ─────────────────────────────────────────────
interface Props {
  proximityState: ProximityState;
  onQuickReport: () => void; // FAB と同じ登録フロー
  onSpotUpdated?: () => void; // 報告後に allSpotsRaw を更新
  onWideAreaSearch?: () => void; // アプリ内広域検索（SearchOverlay を開く）
  onGoogleMapsSearch?: () => void; // Googleマップ検索を起動
  welcomeBackVisible?: boolean; // Googleマップから復帰した
  onWelcomeBackDismiss?: () => void; // 「見つかった？」を閉じる
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
  onQuickReport,
  onSpotUpdated,
  onWideAreaSearch,
  onGoogleMapsSearch,
  welcomeBackVisible,
  onWelcomeBackDismiss,
}: Props) {
  const user = useUser();
  const tutorial = useTutorial();
  const { showPicker, PickerSheet } = usePhotoPicker();

  // アニメーション
  const slideAnim = useRef(new Animated.Value(200)).current; // 下からスライドイン
  const okGlowAnim = useRef(new Animated.Value(0)).current;
  const okGlowRef = useRef<Animated.CompositeAnimation | null>(null);

  // チュートリアル中はダミー近接状態を強制表示
  const isTutorialReport = tutorial.active && tutorial.phase === 'report';
  const effectiveState: ProximityState = isTutorialReport
    ? { kind: 'nearby', nearest: { spot: tutorial.dummySpot, distanceM: 12 } }
    : proximityState;

  // scene steps: カード非表示
  const tutorialHideCard = tutorial.active && !!tutorial.currentStep.sceneTitle;

  // カード内部状態
  const [phase, setPhase] = useState<
    'initial' | 'photo' | 'thanks'
    | 'search-choice' | 'welcome-back'
  >('initial');

  const visible = (effectiveState.kind !== 'normal' || phase === 'welcome-back') && !tutorialHideCard;

  // Googleマップから復帰 → welcome-back phase に遷移
  useEffect(() => {
    if (welcomeBackVisible) setPhase('welcome-back');
  }, [welcomeBackVisible]);
  const [submitting, setSubmitting] = useState(false);

  // 表示中のスポット（nearby の場合）
  const nearbySpot = effectiveState.kind === 'nearby' ? effectiveState.nearest : null;

  // チュートリアルステップ変更時にカード状態をリセット
  useEffect(() => {
    if (!tutorial.active) return;
    if (tutorial.isStep('report-good')) {
      setPhase('initial');
    }
  }, [tutorial.stepIndex]);

  // チュートリアル: ボタンピカピカ（report-good: 停めたボタン / photo: OKボタン）
  const shouldGlow = tutorial.active && (phase === 'photo' || tutorial.isStep('report-good'));
  useEffect(() => {
    if (shouldGlow) {
      okGlowAnim.setValue(0);
      okGlowRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(okGlowAnim, { toValue: 1, duration: 500, useNativeDriver: false }),
          Animated.timing(okGlowAnim, { toValue: 0, duration: 500, useNativeDriver: false }),
        ])
      );
      okGlowRef.current.start();
    } else {
      okGlowRef.current?.stop();
    }
  }, [shouldGlow]);

  // 状態変更時にリセット
  useEffect(() => {
    setPhase('initial');
  }, [effectiveState.kind, nearbySpot?.spot.id]);

  // thanks自動消滅（2秒）
  useEffect(() => {
    if (phase !== 'thanks') return;
    const timer = setTimeout(() => setPhase('initial'), 3000);
    return () => clearTimeout(timer);
  }, [phase]);

  // スライドイン/アウト
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : 200,
      tension: 120,
      friction: 14,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  // 報告済みスポットID（写真追加用に保持）
  const [reportedSpotId, setReportedSpotId] = useState<string | null>(null);

  // ── 足跡: 停めた → 写真メモ → 完了 ────────────────────
  const handleGood = useCallback(async () => {
    // チュートリアル中: Firestore書き込みなしでadvance
    if (tutorial.isStep('report-good')) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      tutorial.advanceTutorial(); // report-good → scene-register
      return;
    }
    if (!nearbySpot || submitting) return;
    const spotId = nearbySpot.spot.id;

    let userId = user?.userId;
    if (!userId) userId = (await AsyncStorage.getItem('moto_logos_device_id')) ?? undefined;
    if (!userId) return;

    setSubmitting(true);
    try {
      const bike = await getFirstVehicle();
      await reportSpotGood(spotId);
      await addReview(spotId, userId, 1, undefined, undefined, undefined, bike?.name);
      await AsyncStorage.setItem(`vote_${spotId}`, 'matched');
      await markReported(spotId);
      logActivityLocal('report', `${nearbySpot.spot.name}に停めた`);
      incrementStat('reports');
      addFootprint(spotId, nearbySpot.spot.name, nearbySpot.spot.latitude, nearbySpot.spot.longitude, 'parked');
      reportParked(spotId).catch((e) => captureError(e, { context: 'proximity_report_parked', spotId }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReportedSpotId(spotId);
      setPhase('thanks');
      onSpotUpdated?.();
    } catch (e) {
      captureError(e, { context: 'proximity_report_good' });
    }
    setSubmitting(false);
  }, [nearbySpot, user, submitting, onSpotUpdated, tutorial]);

  // ── 写真選択の共通処理 ──────────────────────────────
  const uploadPhotoAndFinish = useCallback(async (photoUri: string | null) => {
    if (!photoUri || !reportedSpotId) { setPhase('thanks'); return; }
    let userId = user?.userId;
    if (!userId) userId = (await AsyncStorage.getItem('moto_logos_device_id')) ?? undefined;
    if (!userId) { setPhase('thanks'); return; }

    try {
      const bike = await getFirstVehicle();
      await addReview(reportedSpotId, userId, 1, undefined, photoUri, undefined, bike?.name);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      captureError(e, { context: 'proximity_snap_photo' });
    }
    setPhase('thanks');
  }, [reportedSpotId, user]);

  // ── 看板メモ（ボトムシートで撮影/フォルダ選択） ────────
  const handlePickPhoto = useCallback(async () => {
    try {
      const uri = await showPicker();
      await uploadPhotoAndFinish(uri);
    } catch (e) {
      captureError(e, { context: 'proximity_pick_photo' });
      setPhase('thanks');
    }
  }, [showPicker, uploadPhotoAndFinish]);

  // ── 写真スキップ → 足跡完了 ──────────────────────────
  const skipPhoto = useCallback(() => {
    setPhase('thanks');
  }, []);

  // ── thanks消滅 ────────────────────────────────────────
  const dismissThanks = useCallback(() => {
    setPhase('initial');
  }, []);




  if (!visible) return null;

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY: slideAnim }] }]}
      pointerEvents="box-none"
    >
      <View style={styles.card}>
        {/* ── ニアバイ: 初期カード ─────────────────────── */}
        {effectiveState.kind === 'nearby' && phase === 'initial' && nearbySpot && (
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
                style={[styles.actionBtn, styles.goodBtn, { position: 'relative', overflow: 'visible' }]}
                onPress={handleGood}
                activeOpacity={0.8}
                disabled={submitting}
                accessibilityLabel="ワンショット"
                accessibilityRole="button"
                accessibilityHint="写真を撮って足跡を残します"
              >
                {tutorial.isStep('report-good') && (
                  <Animated.View
                    style={{
                      ...StyleSheet.absoluteFillObject,
                      borderRadius: 14,
                      borderWidth: 3,
                      borderColor: okGlowAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['rgba(255,159,10,0.3)', 'rgba(255,159,10,1)'],
                      }),
                      shadowColor: '#FF9F0A',
                      shadowOffset: { width: 0, height: 0 },
                      shadowRadius: 16,
                      shadowOpacity: okGlowAnim,
                      margin: -4,
                    }}
                    pointerEvents="none"
                  />
                )}
                <Ionicons name="camera" size={22} color="#fff" />
                <Text style={styles.actionText}>ワンショット</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── 写真メモ（停めた直後） ──────────────────────── */}
        {phase === 'photo' && (
          <View>
            <Text style={styles.photoPromptText}>看板や入口の写真をメモしとく？</Text>
            {tutorial.active && (
              <Text style={{ color: '#FF9F0A', fontSize: 14, fontWeight: '600', textAlign: 'center', marginBottom: 8 }}>
                写真もメモできます。OKをタップして次へ
              </Text>
            )}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.snapBtn]}
                onPress={handlePickPhoto}
                activeOpacity={0.8}
              >
                <Ionicons name="camera" size={22} color="#fff" />
                <Text style={styles.actionText}>写真を追加</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.photoSkipLink}
              onPress={skipPhoto}
              activeOpacity={0.8}
            >
              {tutorial.active && (
                <Animated.View
                  style={{
                    ...StyleSheet.absoluteFillObject,
                    borderRadius: 14,
                    borderWidth: 3,
                    borderColor: okGlowAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['rgba(255,159,10,0.2)', 'rgba(255,159,10,1)'],
                    }),
                    shadowColor: '#FF9F0A',
                    shadowOffset: { width: 0, height: 0 },
                    shadowRadius: 14,
                    shadowOpacity: okGlowAnim,
                  }}
                  pointerEvents="none"
                />
              )}
              <Text style={[styles.photoSkipText, tutorial.active && { color: '#FF9F0A', fontWeight: '700' }]}>
                {tutorial.active ? 'OK' : 'スキップ'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 足跡完了（自動消滅 + オプション写真追加） ─── */}
        {phase === 'thanks' && (
          <View>
            <TouchableOpacity onPress={dismissThanks} activeOpacity={0.8}>
              <View style={styles.thanksWrap}>
                <Ionicons name="checkmark-circle" size={28} color={C.green} />
                <Text style={styles.thanksText}>足跡が刻まれました</Text>
              </View>
            </TouchableOpacity>
            {reportedSpotId && !tutorial.active && (
              <TouchableOpacity
                style={styles.addPhotoLink}
                onPress={() => setPhase('photo')}
                activeOpacity={0.7}
              >
                <Ionicons name="camera-outline" size={18} color={C.accent} />
                <Text style={styles.addPhotoText}>写真を追加</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── スポットなし: 初期カード ─────────────────── */}
        {effectiveState.kind === 'no-spots' && phase === 'initial' && (
          <>
            <Text style={styles.noSpotTitle}>この周辺にスポットがありません</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.registerBtn]}
                onPress={onQuickReport}
                activeOpacity={0.8}
              >
                <Ionicons name="camera-outline" size={22} color="#fff" />
                <Text style={styles.actionText}>見つけた</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.searchBtn]}
                onPress={() => setPhase('search-choice')}
                activeOpacity={0.8}
              >
                <Ionicons name="navigate-outline" size={22} color="#fff" />
                <Text style={styles.actionText}>他を探す</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── 検索方法の選択（no-spots → 他を探す） ──────── */}
        {phase === 'search-choice' && (
          <>
            <Text style={styles.noSpotTitle}>どこで探す？</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: C.blue }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onWideAreaSearch?.();
                  setPhase('initial');
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="search-outline" size={22} color="#fff" />
                <Text style={styles.actionText}>アプリ内で探す</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#34A853' }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onGoogleMapsSearch?.();
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="open-outline" size={22} color="#fff" />
                <Text style={styles.actionText}>Googleマップ</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => setPhase('initial')}
              style={styles.backLink}
            >
              <Text style={styles.backText}>戻る</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Googleマップ復帰プロンプト ──────────────────── */}
        {phase === 'welcome-back' && (
          <>
            <Text style={styles.noSpotTitle}>バイク置き場、見つかった？</Text>
            <Text style={[styles.meta, { textAlign: 'center', marginBottom: 14 }]}>
              登録すると次のライダーの道しるべになります
            </Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.registerBtn]}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  onWelcomeBackDismiss?.();
                  onQuickReport();
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="camera-outline" size={22} color="#fff" />
                <Text style={styles.actionText}>登録する</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.badBtn]}
                onPress={() => {
                  onWelcomeBackDismiss?.();
                  setPhase('initial');
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="close-outline" size={22} color="#fff" />
                <Text style={styles.actionText}>今はいい</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

      </View>
      <PickerSheet />
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
  badHint: {
    color: C.sub,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
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
  snapBtn: {
    flex: 1,
    backgroundColor: C.blue,
  },
  albumBtn: {
    flex: 1,
    backgroundColor: '#48484A',
  },
  photoSkipLink: {
    alignSelf: 'center',
    paddingVertical: 10,
    marginTop: 6,
  },
  photoSkipText: {
    color: C.sub,
    fontSize: 14,
    fontWeight: '600',
  },
  skipBtn: {
    flex: 1,
    backgroundColor: '#3A3A3C',
  },
  skipText: {
    color: C.sub,
    fontSize: 16,
    fontWeight: '700',
  },

  // ── 理由選択 ───────────────────────────────────────
  correctionHint: {
    color: C.sub,
    fontSize: 12,
    marginTop: 12,
    marginBottom: 8,
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

  // ── 写真メモ ──────────────────────────────────────
  photoPromptText: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
  },

  // ── 足跡完了 ──────────────────────────────────────
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
  addPhotoLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
  },
  addPhotoText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '600',
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
