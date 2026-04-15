/**
 * SpotDetailSheet v2 — 情報ゾーン / アクションゾーン分離 + 停められた/停められなかった報告
 *
 * 上: 情報ゾーン（スクロール） — 名称・バッジ・写真・住所・料金・過去の報告
 * 下: アクションゾーン（固定） — 案内開始・報告する・シェア
 * 星評価廃止 → 「停められた/停められなかった」で体験を共有
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Linking,
  Platform,
  Alert,
  ScrollView,
  TextInput,
  Image,
  FlatList,
  Dimensions,
  KeyboardAvoidingView,
  ActivityIndicator,
  PanResponder,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';
import { Asset } from 'expo-asset';
import { useTutorial } from '../contexts/TutorialContext';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ParkingPin, Review } from '../types';
import { pickPhotoFromCamera, pickPhotoFromLibrary } from '../utils/photoPicker';
import { haversineMeters } from '../utils/distance';
import {
  addFavorite,
  removeFavorite,
  getAllFavorites,
  incrementStat,
  logActivityLocal,
} from '../db/database';
import {
  addReview,
  fetchReviews,
  fetchSpotCounts,
  reportSpotGood,
  reportSpotFull,
  reportSpotClosed,
  incrementViewCount,
  fetchSpotsInRegion,
} from '../firebase/firestoreService';
import { getFirstVehicle } from '../db/database';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { captureError } from '../utils/sentry';
import { useUser } from '../contexts/UserContext';
import { spotTemperature, temperatureLabel, lastArrivedText, TEMP_STYLE } from '../utils/temperature';

const { height: SCREEN_H } = Dimensions.get('window');

// ─── カラー定数（card = cardElevated: #2C2C2E） ───────
const C = { ...Colors, card: Colors.cardElevated };

// ─── ヘルパー ─────────────────────────────────────────
function ccLabel(maxCC: number | null): string {
  if (maxCC === null) return '制限なし';
  if (maxCC === 50)   return '原付のみ';
  if (maxCC === 125)  return '〜125cc';
  if (maxCC === 250)  return '〜250cc';
  return `〜${maxCC}cc`;
}

function markerColor(spot: ParkingPin): string {
  if (spot.source === 'user') return C.purple;
  if (spot.maxCC === null)    return C.blue;
  if (spot.maxCC >= 250)     return C.green;
  if (spot.maxCC >= 125)     return C.blue;
  return C.sub;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

type CorrectionType = 'full' | 'closed' | 'wrong_price' | 'wrong_cc' | 'other';

const CORRECTION_OPTIONS: { id: CorrectionType; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { id: 'full',        label: '満車だった',     icon: 'time',          color: C.orange },
  { id: 'closed',      label: '閉鎖されていた', icon: 'close-circle',  color: C.red },
  { id: 'wrong_price', label: '料金が違う',     icon: 'cash-outline',  color: C.orange },
  { id: 'wrong_cc',    label: '排気量制限が違う', icon: 'speedometer-outline', color: C.orange },
  { id: 'other',       label: 'その他',         icon: 'ellipsis-horizontal', color: C.sub },
];

// ─── Props ────────────────────────────────────────────
interface Props {
  spot: ParkingPin;
  onClose: () => void;
  onSetDestination?: (spot: ParkingPin) => void;
  onSpotSelect?: (spot: ParkingPin) => void;
}

function fmtDist(m: number): string {
  if (m < 1000) return `${Math.round(m)}m先`;
  return `${(m / 1000).toFixed(1)}km先`;
}

interface NearbySpot {
  spot: ParkingPin;
  distanceM: number;
}

// ─── メインコンポーネント ──────────────────────────────
export function SpotDetailSheet({ spot, onClose, onSetDestination, onSpotSelect }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const user = useUser();
  const tutorial = useTutorial();
  const navBtnRef = useRef<View>(null);
  const sheetRef = useRef<View>(null);

  // チュートリアル: ターゲット位置登録
  useEffect(() => {
    if (!tutorial.active) return;
    const measure = () => {
      navBtnRef.current?.measureInWindow((x, y, w, h) => {
        if (w > 0) tutorial.registerTarget('nav-button', { x, y, w, h, borderRadius: 14 });
      });
      sheetRef.current?.measureInWindow((x, y, w, h) => {
        if (w > 0) tutorial.registerTarget('detail-sheet', { x, y, w, h, borderRadius: 20 });
      });
    };
    setTimeout(measure, 400);
    setTimeout(measure, 900);
  }, [tutorial.active, tutorial.stepIndex]);

  // 下スワイプで閉じるアニメーション
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const swipePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 10,
      onPanResponderMove: (_, gs) => { if (gs.dy > 0) sheetTranslateY.setValue(gs.dy); },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80) {
          Animated.timing(sheetTranslateY, { toValue: 500, duration: 200, useNativeDriver: true }).start(onClose);
        } else {
          Animated.spring(sheetTranslateY, { toValue: 0, tension: 200, friction: 15, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  // Favorites
  const [isFav, setIsFav]           = useState(false);
  const [favLoading, setFavLoading] = useState(false);

  // Reports (旧 reviews)
  const [reports, setReports]           = useState<Review[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  // Report modal
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportStep, setReportStep]           = useState<'ask' | 'matched' | 'unmatched'>('ask');
  const [correction, setCorrection]           = useState<CorrectionType | null>(null);
  const [reportComment, setReportComment]     = useState('');
  const [reportPhoto, setReportPhoto]         = useState<string | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [alreadyVoted, setAlreadyVoted]       = useState(false);

  // Fullscreen photo
  const [fullPhoto, setFullPhoto] = useState<string | null>(null);

  // 周辺スポット（案内開始後に表示）
  const [nearbySpots, setNearbySpots] = useState<NearbySpot[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);

  // ── 初期ロード ───────────────────────────────────────
  const loadAll = useCallback(async () => {
    const src = spot.source as 'seed' | 'user';
    setReportsLoading(true);
    const [favs, r, prev] = await Promise.all([
      getAllFavorites(),
      fetchReviews(spot.id, 'date'),
      AsyncStorage.getItem(`vote_${spot.id}`),
    ]);
    setIsFav(favs.some((f) => f.spotId === spot.id && f.source === src));
    setReports(r);
    setAlreadyVoted(!!prev);
    setReportsLoading(false);
  }, [spot]);

  useEffect(() => {
    if (tutorial.active && spot.id === '_tutorial_spot_') {
      // チュートリアル: ダミーレビュー + 写真を表示
      const asset = Asset.fromModule(require('../../assets/tutorial-parking.jpg'));
      asset.downloadAsync().then(() => {
        setReports([
          { id: 901, spotId: spot.id, source: 'seed', score: 1, comment: '広くて停めやすい！', photoUri: asset.localUri ?? asset.uri, createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
          { id: 902, spotId: spot.id, source: 'seed', score: 1, comment: null, photoUri: null, createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
          { id: 903, spotId: spot.id, source: 'seed', score: 0, comment: '[full] 土日は満車多い', photoUri: null, createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() },
        ]);
      });
      setAlreadyVoted(false);
      setReportsLoading(false);
      return;
    }
    loadAll();
    incrementViewCount(spot.id);
  }, [loadAll, tutorial.active]);

  // ── お気に入りトグル ──────────────────────────────────
  const toggleFav = async () => {
    setFavLoading(true);
    const src = spot.source as 'seed' | 'user';
    try {
      if (isFav) { await removeFavorite(spot.id, src); setIsFav(false); }
      else       { await addFavorite(spot.id, src);    setIsFav(true);  }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) { captureError(e, { context: 'toggle_favorite' }); }
    setFavLoading(false);
  };

  // ── ナビゲーション ────────────────────────────────────
  const openGoogleMaps = () => {
    const url = Platform.select({
      ios:     `comgooglemaps://?daddr=${spot.latitude},${spot.longitude}&directionsmode=driving`,
      android: `google.navigation:q=${spot.latitude},${spot.longitude}`,
    }) ?? `https://maps.google.com/maps?daddr=${spot.latitude},${spot.longitude}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/maps?daddr=${spot.latitude},${spot.longitude}`)
    );
  };

  const openYahooNavi = async () => {
    const name = encodeURIComponent(spot.name);
    const newLink = `ynavigation://v1/route?lat=${spot.latitude}&lon=${spot.longitude}&name=${name}&type=drive`;
    const oldLink = `yjnavicar://v1/map?lat=${spot.latitude}&lon=${spot.longitude}&name=${name}`;
    const web     = `https://map.yahoo.co.jp/app/navi?lat=${spot.latitude}&lon=${spot.longitude}&name=${name}`;
    try {
      if (await Linking.canOpenURL(newLink)) { await Linking.openURL(newLink); return; }
      if (await Linking.canOpenURL(oldLink)) { await Linking.openURL(oldLink); return; }
    } catch (e) { captureError(e, { context: 'yahoo_navi_deeplink' }); }
    Linking.openURL(web).catch((e) => captureError(e, { context: 'yahoo_navi' }));
  };

  const handleNav = () => {
    // 「ここ行く」→ 到着検知の起点
    onSetDestination?.(spot);
    Alert.alert('案内開始', spot.name, [
      { text: 'Googleマップ',   onPress: openGoogleMaps },
      { text: 'Yahoo!カーナビ', onPress: openYahooNavi },
      { text: '住所をコピー',   onPress: async () => {
          const t = spot.address ? `${spot.name}\n${spot.address}` : `${spot.name}\n${spot.latitude}, ${spot.longitude}`;
          await Clipboard.setStringAsync(t);
          Alert.alert('コピーしました', spot.address ?? `${spot.latitude}, ${spot.longitude}`);
        }},
      { text: 'キャンセル', style: 'cancel' },
    ]);
  };

  // ── 報告: 写真ピッカー（カメラ） ──────────────────────
  const pickReportPhoto = async () => {
    const uri = await pickPhotoFromCamera();
    if (uri) setReportPhoto(uri);
  };

  // ── 報告: 写真ピッカー（アルバム） ────────────────────
  const pickReportPhotoFromAlbum = async () => {
    const uri = await pickPhotoFromLibrary();
    if (uri) setReportPhoto(uri);
  };

  // ── 報告: 送信 ────────────────────────────────────────
  const submitReport = async (matched: boolean) => {
    let userId = user?.userId;
    if (!userId) {
      userId = await AsyncStorage.getItem('moto_logos_device_id') ?? undefined;
    }
    if (!userId) { Alert.alert('エラー', 'ユーザー情報を読み込めません。アプリを再起動してください。'); return; }
    setReportSubmitting(true);
    try {
      const spotId = spot.id;
      const comment = matched
        ? reportComment.trim() || undefined
        : `[${correction ?? 'other'}] ${reportComment.trim()}`.trim();

      // Firestore にステータス反映
      if (matched) {
        await reportSpotGood(spotId).catch((e) => captureError(e, { context: 'report_matched' }));
      } else if (correction === 'full') {
        await reportSpotFull(spotId).catch((e) => captureError(e, { context: 'report_full' }));
      } else if (correction === 'closed') {
        await reportSpotClosed(spotId).catch((e) => captureError(e, { context: 'report_closed' }));
      }

      // 足跡として保存（score: 1=停めた, 0=停められなかった）
      const bike = await getFirstVehicle();
      await addReview(spotId, userId, matched ? 1 : 0, comment, reportPhoto ?? undefined, undefined, bike?.name);

      // ローカル記録
      AsyncStorage.setItem(`vote_${spotId}`, matched ? 'matched' : correction ?? 'unmatched');
      logActivityLocal('report', `${spot.name}に${matched ? '停めた' : '停められなかった'}`);
      incrementStat('reports');

      Haptics.notificationAsync(matched
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning
      );

      setAlreadyVoted(true);
      setReportModalOpen(false);
      resetReportModal();
      await loadAll();
    } catch (e: unknown) {
      captureError(e, { context: 'submitReport' });
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('送信に失敗しました', message);
    }
    setReportSubmitting(false);
  };

  const resetReportModal = () => {
    setReportStep('ask');
    setCorrection(null);
    setReportComment('');
    if (reportPhoto) FileSystem.deleteAsync(reportPhoto, { idempotent: true }).catch((e) => captureError(e, { context: 'temp_file_cleanup' }));
    setReportPhoto(null);
  };

  const openReportModal = () => {
    if (alreadyVoted) {
      Alert.alert('記録済み', 'このスポットは既に記録済みです');
      return;
    }
    resetReportModal();
    setReportModalOpen(true);
  };

  // ─────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────
  const photos = reports.filter((r) => r.photoUri);

  return (
    <>
      {/* フルスクリーン写真 */}
      {fullPhoto && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setFullPhoto(null)}>
          <TouchableOpacity style={styles.fullscreenBg} activeOpacity={1} onPress={() => setFullPhoto(null)}>
            <Image source={{ uri: fullPhoto }} style={styles.fullscreenImage} resizeMode="contain" />
            <TouchableOpacity
              style={styles.fullscreenClose}
              onPress={() => setFullPhoto(null)}
              accessibilityLabel="写真を閉じる"
              accessibilityRole="button"
            >
              <Ionicons name="close-circle" size={36} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* ── 報告モーダル（停められた/停められなかった） ── */}
      <Modal
        visible={reportModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => { setReportModalOpen(false); resetReportModal(); }}
      >
        <View style={styles.reportOverlay}>
          <TouchableOpacity style={styles.reportOverlayTap} activeOpacity={1} onPress={() => { setReportModalOpen(false); resetReportModal(); }} />
          <View style={styles.reportSheet}>
            {/* ステップ1: 停められた？ */}
            {reportStep === 'ask' && (
              <View style={styles.reportCenter}>
                <Text style={styles.reportQuestion}>ここに停めた？</Text>
                <Text style={styles.reportHint}>{spot.name}</Text>
                <View style={{ height: 24 }} />
                <View style={styles.reportChoiceRow}>
                  <TouchableOpacity
                    style={styles.reportMatchedBtn}
                    onPress={() => setReportStep('matched')}
                    activeOpacity={0.8}
                    accessibilityLabel="停めた"
                    accessibilityRole="button"
                    accessibilityHint="ここに駐車できたことを記録します"
                  >
                    <Ionicons name="thumbs-up" size={28} color="#fff" />
                    <Text style={styles.reportChoiceText}>停めた</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.reportUnmatchedBtn}
                    onPress={() => setReportStep('unmatched')}
                    activeOpacity={0.8}
                    accessibilityLabel="停められなかった"
                    accessibilityRole="button"
                    accessibilityHint="駐車できなかったことを記録します"
                  >
                    <Ionicons name="thumbs-down" size={28} color="#fff" />
                    <Text style={styles.reportChoiceText}>停められなかった</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.reportCancelLink} onPress={() => { setReportModalOpen(false); resetReportModal(); }}>
                  <Text style={styles.reportCancelText}>キャンセル</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ステップ2a: 停められた → ひとこと + 写真（任意） */}
            {reportStep === 'matched' && (
              <View style={styles.reportFormContent}>
                <View style={styles.reportMatchedBadge}>
                  <Ionicons name="thumbs-up" size={20} color={C.green} />
                  <Text style={[styles.reportBadgeText, { color: C.green }]}>ここに停めた！</Text>
                </View>
                <Text style={styles.reportFormHint}>ひとことや写真を残せます（任意）</Text>
                <TextInput
                  style={styles.reportInput}
                  placeholder="例: 空きあり、停めやすかった"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  value={reportComment}
                  onChangeText={setReportComment}
                  multiline
                  blurOnSubmit
                />
                {reportPhoto ? (
                  <View style={styles.reportPhotoPreview}>
                    <Image source={{ uri: reportPhoto }} style={styles.reportPhotoThumb} />
                    <TouchableOpacity style={styles.reportPhotoRemove} onPress={() => { FileSystem.deleteAsync(reportPhoto!, { idempotent: true }).catch((e) => captureError(e, { context: 'temp_file_cleanup' })); setReportPhoto(null); }}>
                      <Ionicons name="close-circle" size={22} color={C.red} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.reportPhotoBtnRow}>
                    <TouchableOpacity style={styles.reportPhotoBtn} onPress={pickReportPhoto}>
                      <Ionicons name="camera-outline" size={18} color={C.blue} />
                      <Text style={styles.reportPhotoBtnText}>撮影する</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.reportPhotoBtn} onPress={pickReportPhotoFromAlbum}>
                      <Ionicons name="images-outline" size={18} color={C.blue} />
                      <Text style={styles.reportPhotoBtnText}>アルバムから</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.reportSubmitBtn, { backgroundColor: C.green }]}
                  onPress={() => submitReport(true)}
                  disabled={reportSubmitting}
                  activeOpacity={0.8}
                >
                  {reportSubmitting
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.reportSubmitText}>送信する</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setReportStep('ask')} style={styles.reportBackLink}>
                  <Text style={styles.reportCancelText}>戻る</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ステップ2b: ダメだった → 何があった？ + ひとこと + 写真 */}
            {reportStep === 'unmatched' && (
              <ScrollView contentContainerStyle={styles.reportFormContent} keyboardShouldPersistTaps="handled">
                <View style={styles.reportUnmatchedBadge}>
                  <Ionicons name="thumbs-down" size={20} color={C.orange} />
                  <Text style={[styles.reportBadgeText, { color: C.orange }]}>何があった？</Text>
                </View>
                <View style={styles.correctionGrid}>
                  {CORRECTION_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.correctionBtn, correction === opt.id && { borderColor: opt.color, backgroundColor: `${opt.color}18` }]}
                      onPress={() => setCorrection(opt.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={opt.icon} size={18} color={correction === opt.id ? opt.color : C.sub} />
                      <Text style={[styles.correctionLabel, correction === opt.id && { color: opt.color }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.reportInput}
                  placeholder="詳細があれば（任意）"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  value={reportComment}
                  onChangeText={setReportComment}
                  multiline
                  blurOnSubmit
                />
                {reportPhoto ? (
                  <View style={styles.reportPhotoPreview}>
                    <Image source={{ uri: reportPhoto }} style={styles.reportPhotoThumb} />
                    <TouchableOpacity style={styles.reportPhotoRemove} onPress={() => { FileSystem.deleteAsync(reportPhoto!, { idempotent: true }).catch((e) => captureError(e, { context: 'temp_file_cleanup' })); setReportPhoto(null); }}>
                      <Ionicons name="close-circle" size={22} color={C.red} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.reportPhotoBtnRow}>
                    <TouchableOpacity style={styles.reportPhotoBtn} onPress={pickReportPhoto}>
                      <Ionicons name="camera-outline" size={18} color={C.blue} />
                      <Text style={styles.reportPhotoBtnText}>撮影する</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.reportPhotoBtn} onPress={pickReportPhotoFromAlbum}>
                      <Ionicons name="images-outline" size={18} color={C.blue} />
                      <Text style={styles.reportPhotoBtnText}>アルバムから</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.reportSubmitBtn, { backgroundColor: C.orange }, !correction && { opacity: 0.4 }]}
                  onPress={() => submitReport(false)}
                  disabled={reportSubmitting || !correction}
                  activeOpacity={0.8}
                >
                  {reportSubmitting
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.reportSubmitText}>記録する</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setReportStep('ask')} style={styles.reportBackLink}>
                  <Text style={styles.reportCancelText}>戻る</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* シート */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrapper} pointerEvents="box-none">
        <Animated.View ref={sheetRef} style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}>
          {/* スワイプハンドル */}
          <View {...swipePan.panHandlers} style={styles.handleArea}>
            <View style={styles.handle} />
          </View>

          {/* ── 情報ゾーン（スクロール） ──────────────── */}
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* ヘッダー */}
            <View style={styles.titleRow}>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="詳細シートを閉じる"
                accessibilityRole="button"
              >
                <Ionicons name="close-circle" size={28} color={C.sub} />
              </TouchableOpacity>
              <Text style={styles.spotName} numberOfLines={2}>{spot.name}</Text>
              <TouchableOpacity
                style={styles.favBtn}
                onPress={toggleFav}
                disabled={favLoading}
                accessibilityLabel={isFav ? 'お気に入りから削除' : 'お気に入りに追加'}
                accessibilityRole="button"
                accessibilityState={{ selected: isFav }}
              >
                <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={26} color={C.pink} />
              </TouchableOpacity>
            </View>

            {/* バッジ */}
            <View style={styles.badgeRow}>
              {spot.source === 'user' && (
                <View style={[styles.badge, { backgroundColor: C.purple }]}>
                  <Text style={styles.badgeText}>ユーザー登録</Text>
                </View>
              )}
              <View style={[styles.badge, { backgroundColor: markerColor(spot) }]}>
                <Text style={styles.badgeText}>{ccLabel(spot.maxCC)}</Text>
              </View>
              {spot.isFree === true && (
                <View style={[styles.badge, { backgroundColor: C.green }]}>
                  <Text style={styles.badgeText}>無料</Text>
                </View>
              )}
              {spot.isFree === false && (
                <View style={[styles.badge, styles.badgeMuted]}>
                  <Text style={styles.badgeTextMuted}>有料</Text>
                </View>
              )}
              {spot.isFree === null && (
                <View style={[styles.badge, styles.badgeMuted]}>
                  <Text style={styles.badgeTextMuted}>料金未確認</Text>
                </View>
              )}
              {spot.capacity != null && (
                <View style={[styles.badge, styles.badgeMuted]}>
                  <Text style={styles.badgeTextMuted}>{spot.capacity}台</Text>
                </View>
              )}
              {(spot.currentParked ?? 0) > 0 && (
                <View style={[styles.badge, { backgroundColor: C.green }]}>
                  <Text style={styles.badgeText}>今{spot.currentParked}台が駐車中</Text>
                </View>
              )}
              <TemperatureBadge spot={spot} />
            </View>

            {/* 温度テキスト（足跡の鮮度） */}
            <TemperatureText spot={spot} />

            {/* 写真ギャラリー */}
            {photos.length > 0 ? (
              <View style={styles.gallerySection}>
                <FlatList
                  horizontal
                  data={photos}
                  keyExtractor={(r) => `photo_${r.firestoreId ?? r.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.galleryList}
                  renderItem={({ item }) => (
                    <TouchableOpacity onPress={() => setFullPhoto(item.photoUri!)} activeOpacity={0.85}>
                      <View>
                        <Image source={{ uri: item.photoUri! }} style={styles.galleryThumb} />
                        {item.photoTag && (
                          <View style={styles.photoTagBadge}>
                            <Text style={styles.photoTagText}>
                              {item.photoTag === 'sign' ? '\uD83D\uDCCB 看板' : item.photoTag === 'entrance' ? '\uD83D\uDEAA 入口' : '\uD83D\uDCF8'}
                            </Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  )}
                />
              </View>
            ) : (
              <View style={styles.noPhotoHint}>
                <Ionicons name="camera-outline" size={16} color={C.sub} />
                <Text style={styles.noPhotoText}>まだ写真がありません</Text>
              </View>
            )}

            {/* 住所 */}
            {spot.address && (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={15} color={C.sub} />
                <Text style={styles.metaText}>{spot.address}</Text>
              </View>
            )}

            {/* 精算・料金 */}
            <PaymentSection spot={spot} />

            {/* 過去の報告 */}
            {reportsLoading ? (
              <ActivityIndicator color={C.blue} style={{ marginVertical: 20 }} />
            ) : reports.length > 0 ? (
              <View style={styles.reportsSection}>
                <Text style={styles.sectionLabel}>みんなの足跡</Text>
                {reports.map((r) => (
                  <ReportCard key={r.firestoreId ?? String(r.id)} report={r} onPhotoTap={setFullPhoto} />
                ))}
              </View>
            ) : null}

            <View style={{ height: 16 }} />
          </ScrollView>

          {/* ── アクションゾーン（固定フッター） ────── */}
          <View style={styles.footer}>
            <TouchableOpacity
              ref={navBtnRef}
              style={styles.footerNavBtn}
              onPress={() => {
                if (tutorial.isStep('explore-nav')) {
                  // チュートリアル: 実リンクを開かず説明テキストで進む
                  Alert.alert(
                    '案内開始',
                    'GoogleマップやYahoo!カーナビに遷移します',
                    [{ text: 'OK', onPress: () => tutorial.advanceTutorial() }],
                    { cancelable: false },
                  );
                  return;
                }
                handleNav();
              }}
              activeOpacity={0.85}
              accessibilityLabel="案内開始"
              accessibilityRole="button"
              accessibilityHint="ナビアプリでこのスポットへの案内を開始します"
            >
              <Ionicons name="navigate" size={17} color="#fff" />
              <Text style={styles.footerNavText}>案内開始</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerReportBtn, alreadyVoted && { opacity: 0.5 }]}
              onPress={openReportModal}
              activeOpacity={0.8}
              accessibilityLabel={alreadyVoted ? '記録済み' : '足跡を残す'}
              accessibilityRole="button"
              accessibilityHint="このスポットに停められたか記録します"
              accessibilityState={{ disabled: alreadyVoted }}
            >
              <Ionicons name="chatbubble-ellipses" size={17} color="#fff" />
              <Text style={styles.footerReportText}>{alreadyVoted ? '記録済み' : '足跡を残す'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.footerShareBtn}
              activeOpacity={0.75}
              onPress={() => {
                const url = `https://maps.google.com/maps?q=${spot.latitude},${spot.longitude}`;
                Share.share({ message: `${spot.name}\n${spot.address ?? ''}\n${url}\n\n— Moto-Logos で共有` });
              }}
              accessibilityLabel="このスポットを共有"
              accessibilityRole="button"
              accessibilityHint="スポット情報をメッセージやSNSで共有します"
            >
              <Ionicons name="share-outline" size={20} color={C.blue} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </>
  );
}

// ─── 温度バッジ（足跡の鮮度） ─────────────────────────
function TemperatureBadge({ spot }: { spot: ParkingPin }) {
  const temp = spotTemperature(spot);
  const color = TEMP_STYLE[temp].color;
  const label = temperatureLabel(temp);
  return (
    <View style={[styles.badge, { backgroundColor: `${color}18`, borderWidth: StyleSheet.hairlineWidth, borderColor: `${color}44` }]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginRight: 4 }} />
      <Text style={[styles.badgeText, { color, fontSize: 10, fontWeight: '600' }]}>{label}</Text>
    </View>
  );
}

// ─── 温度テキスト（「Xh前にライダーが利用」/「最初の足跡を残せます」） ──
function TemperatureText({ spot }: { spot: ParkingPin }) {
  const temp = spotTemperature(spot);
  const text = lastArrivedText(spot);
  const color = temp === 'cold' ? C.accent : TEMP_STYLE[temp].color;
  const icon = temp === 'cold' ? 'footsteps-outline' : 'time-outline';
  return (
    <View style={styles.temperatureRow}>
      <Ionicons name={icon as 'time-outline'} size={14} color={color} />
      <Text style={[styles.temperatureText, { color }]}>{text}</Text>
    </View>
  );
}

// ─── 精算・料金セクション ──────────────────────────────
function PaymentSection({ spot }: { spot: ParkingPin }) {
  const hasPriceText = !!spot.priceInfo;
  const hasPriceNum = spot.pricePerHour != null;
  const hasHours = !!spot.openHours;
  const hasPayment = spot.paymentCash || spot.paymentIC || spot.paymentQR;

  if (!hasPriceText && !hasPriceNum && !hasHours && !hasPayment && spot.isFree !== false) {
    if (spot.isFree === true) {
      return (
        <View style={[styles.metaRow, { marginTop: 10 }]}>
          <Ionicons name="checkmark-circle" size={16} color={C.green} />
          <Text style={[styles.metaText, { color: C.green }]}>無料で駐輪できます</Text>
        </View>
      );
    }
    return null;
  }

  const priceDisplay = hasPriceText
    ? spot.priceInfo
    : hasPriceNum
      ? `¥${spot.pricePerHour?.toLocaleString()} / 時間`
      : spot.isFree === false ? '有料（料金不明）' : null;

  const paymentMethods: { label: string; icon: keyof typeof Ionicons.glyphMap; active: boolean }[] = [
    { label: '現金', icon: 'cash-outline', active: !!spot.paymentCash },
    { label: 'IC', icon: 'card-outline', active: !!spot.paymentIC },
    { label: 'QR', icon: 'qr-code-outline', active: !!spot.paymentQR },
  ];

  return (
    <View style={styles.paymentCard}>
      {priceDisplay && (
        <View style={styles.paymentRow}>
          <Ionicons name="cash-outline" size={15} color={C.orange} />
          <View style={{ flex: 1 }}>
            <Text style={styles.paymentLabel}>料金</Text>
            <Text style={styles.paymentValue}>{priceDisplay}</Text>
          </View>
        </View>
      )}
      {hasHours && (
        <View style={[styles.paymentRow, priceDisplay ? { marginTop: 8 } : undefined]}>
          <Ionicons name="time-outline" size={15} color={C.blue} />
          <View style={{ flex: 1 }}>
            <Text style={styles.paymentLabel}>営業時間</Text>
            <Text style={styles.paymentValue}>{spot.openHours}</Text>
          </View>
        </View>
      )}
      {hasPayment && (
        <View style={[styles.paymentRow, (priceDisplay || hasHours) ? { marginTop: 8 } : undefined]}>
          <Ionicons name="wallet-outline" size={15} color={C.purple} />
          <View style={{ flex: 1 }}>
            <Text style={styles.paymentLabel}>決済手段</Text>
            <View style={styles.paymentChips}>
              {paymentMethods.filter((m) => m.active).map((m) => (
                <View key={m.label} style={styles.paymentChip}>
                  <Ionicons name={m.icon} size={12} color={C.text} />
                  <Text style={styles.paymentChipText}>{m.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── 報告カード（旧レビューカード） ─────────────────────
const CORRECTION_LABELS: Record<string, { label: string; color: string }> = {
  full: { label: '満車だった', color: C.orange },
  closed: { label: '閉鎖されていた', color: C.red },
  wrong_price: { label: '料金が違う', color: C.orange },
  wrong_cc: { label: '排気量制限が違う', color: C.orange },
  other: { label: 'その他', color: C.sub },
};

function ReportCard({ report, onPhotoTap }: { report: Review; onPhotoTap: (uri: string) => void }) {
  // score: 1=停められた, 0=停められなかった, 2-5=旧星レビュー
  const isMatched = report.score === 1;
  const isUnmatched = report.score === 0;
  const isLegacy = report.score >= 2;

  // コメントから修正タイプを抽出
  const correctionMatch = report.comment?.match(/^\[(full|closed|wrong_price|wrong_cc|other)\]\s*/);
  const correctionKey = correctionMatch?.[1];
  const correctionInfo = correctionKey ? CORRECTION_LABELS[correctionKey] : null;
  const cleanComment = report.comment?.replace(/^\[(full|closed|wrong_price|wrong_cc|other)\]\s*/, '').trim();

  return (
    <View style={styles.reportCard}>
      <View style={styles.reportCardTop}>
        {isMatched && (
          <View style={styles.reportCardBadge}>
            <Ionicons name="thumbs-up" size={13} color={C.green} />
            <Text style={[styles.reportCardBadgeText, { color: C.green }]}>停めた</Text>
          </View>
        )}
        {isUnmatched && (
          <View style={styles.reportCardBadge}>
            <Ionicons name="thumbs-down" size={13} color={correctionInfo?.color ?? C.orange} />
            <Text style={[styles.reportCardBadgeText, { color: correctionInfo?.color ?? C.orange }]}>
              {correctionInfo?.label ?? '停められなかった'}
            </Text>
          </View>
        )}
        {isLegacy && (
          <View style={styles.reportCardBadge}>
            <Ionicons name="chatbubble-outline" size={13} color={C.sub} />
            <Text style={[styles.reportCardBadgeText, { color: C.sub }]}>メモ</Text>
          </View>
        )}
        <Text style={styles.reportCardDate}>{formatDate(report.createdAt)}</Text>
      </View>
      {report.vehicleName ? (
        <Text style={styles.reportCardVehicle}>{report.vehicleName} で記録</Text>
      ) : null}
      {cleanComment ? (
        <Text style={styles.reportCardComment}>{cleanComment}</Text>
      ) : null}
      {report.photoUri && (
        <TouchableOpacity onPress={() => onPhotoTap(report.photoUri!)} activeOpacity={0.85} style={{ marginTop: 8 }}>
          <Image source={{ uri: report.photoUri }} style={styles.reportCardPhoto} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── スタイル ──────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrapper: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: C.sheet, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: SCREEN_H * 0.85, overflow: 'hidden',
  },
  scrollContent: { padding: Spacing.lg, paddingTop: 12, paddingBottom: 8 },
  handleArea: { paddingVertical: 10, alignItems: 'center' },
  handle: { width: 36, height: 4, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 2 },

  // Header
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  closeBtn: { padding: 2, marginTop: -1 },
  spotName: { color: C.text, fontSize: FontSize.lg, fontWeight: '700', flex: 1, lineHeight: 26 },
  favBtn:   { padding: 6, marginTop: -2 },

  // Badges
  badgeRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  badge:          { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeMuted:     { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  badgeText:      { color: '#fff', fontSize: 12, fontWeight: '600' },
  badgeTextMuted: { color: C.sub, fontSize: 12 },

  // Temperature
  temperatureRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  temperatureText: { fontSize: 13, fontWeight: '500' },

  // Meta
  metaRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10 },
  metaText: { color: C.sub, fontSize: 13, flex: 1 },

  // Payment
  paymentCard: { backgroundColor: C.card, borderRadius: 12, padding: Spacing.md, marginTop: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, gap: 4 },
  paymentRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  paymentLabel:{ color: C.sub, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  paymentValue:{ color: C.text, fontSize: 14, fontWeight: '600', marginTop: 2 },
  paymentChips:{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  paymentChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  paymentChipText: { color: C.text, fontSize: 12, fontWeight: '500' },

  // Gallery
  gallerySection: { marginTop: 12 },
  galleryList:    { gap: 8, paddingRight: 4 },
  galleryThumb:   { width: 130, height: 96, borderRadius: 12, backgroundColor: C.card },
  photoTagBadge:  { position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  photoTagText:   { color: '#fff', fontSize: 10, fontWeight: '600' },
  noPhotoHint:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 8 },
  noPhotoText:    { color: C.sub, fontSize: 12 },

  // Reports section
  reportsSection: { marginTop: 20 },
  sectionLabel:   { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 10 },

  // Report card
  reportCard: { backgroundColor: C.card, borderRadius: 12, padding: Spacing.md, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  reportCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reportCardBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reportCardBadgeText: { fontSize: 12, fontWeight: '700' },
  reportCardDate: { color: C.sub, fontSize: 11 },
  reportCardVehicle: { color: C.sub, fontSize: 12, marginTop: 4 },
  reportCardComment: { color: C.text, fontSize: 14, marginTop: 8, lineHeight: 20 },
  reportCardPhoto: { width: '100%', height: 160, borderRadius: 8 },

  // Footer (fixed action zone)
  footer: {
    flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.lg, paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
  },
  footerNavBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: C.blue, borderRadius: 14, paddingVertical: 14,
  },
  footerNavText: { color: '#fff', fontSize: FontSize.md, fontWeight: '600' },
  footerReportBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#FF6B00', borderRadius: 14, paddingVertical: 14,
  },
  footerReportText: { color: '#fff', fontSize: FontSize.md, fontWeight: '600' },
  footerShareBtn: {
    width: 50, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(10,132,255,0.12)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(10,132,255,0.3)',
  },

  // Report modal
  reportOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  reportOverlayTap: { flex: 1 },
  reportSheet: { backgroundColor: C.sheet, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: SCREEN_H * 0.7, minHeight: 300 },
  reportCenter: { alignItems: 'center', padding: 32 },
  reportQuestion: { color: C.text, fontSize: 22, fontWeight: '800' },
  reportHint: { color: C.sub, fontSize: 13, marginTop: 6 },
  reportChoiceRow: { flexDirection: 'row', gap: 16 },
  reportMatchedBtn: {
    alignItems: 'center', gap: 8, backgroundColor: 'rgba(48,209,88,0.18)',
    borderWidth: 1, borderColor: 'rgba(48,209,88,0.4)', borderRadius: 16,
    paddingVertical: 20, paddingHorizontal: 32,
  },
  reportUnmatchedBtn: {
    alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,159,10,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,159,10,0.4)', borderRadius: 16,
    paddingVertical: 20, paddingHorizontal: 32,
  },
  reportChoiceText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  reportCancelLink: { marginTop: 20, paddingVertical: 8 },
  reportCancelText: { color: C.sub, fontSize: 14 },
  reportBackLink: { alignItems: 'center', paddingVertical: 8, marginTop: 4 },

  // Report form (step 2)
  reportFormContent: { padding: 24, gap: 16 },
  reportMatchedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center' },
  reportUnmatchedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center' },
  reportBadgeText: { fontSize: 18, fontWeight: '800' },
  reportFormHint: { color: C.sub, fontSize: 13, textAlign: 'center' },
  reportInput: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14,
    color: C.text, fontSize: 14, minHeight: 60,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  correctionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  correctionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, backgroundColor: 'rgba(255,255,255,0.04)',
  },
  correctionLabel: { color: C.sub, fontSize: 13, fontWeight: '600' },
  reportPhotoBtnRow: {
    flexDirection: 'row', gap: 8,
  },
  reportPhotoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(10,132,255,0.35)',
  },
  reportPhotoBtnText: { color: C.blue, fontSize: 13, fontWeight: '500' },
  reportPhotoPreview: { position: 'relative' },
  reportPhotoThumb: { width: '100%', height: 140, borderRadius: 10 },
  reportPhotoRemove: { position: 'absolute', top: 6, right: 6 },
  reportSubmitBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  reportSubmitText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Fullscreen
  fullscreenBg:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  fullscreenImage: { width: '100%', height: '80%' },
  fullscreenClose: { position: 'absolute', top: 56, right: 20 },
});
