/**
 * SpotDetailSheet v3 — ワンショット + 自分のノート
 *
 * 上: 情報ゾーン（スクロール） — 名称・バッジ・自分のノート・写真・住所・料金・みんなの足跡
 * 下: アクションゾーン（固定） — 案内開始・📷ワンショット・シェア
 * 「停めた✓」ボタン → 📷ワンショット（写真1枚で確認 + 自分のノートに保存）
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  FlatList,
  Dimensions,
  KeyboardAvoidingView,
  ActivityIndicator,
  PanResponder,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';
import { Asset } from 'expo-asset';
import { useTutorial } from '../contexts/TutorialContext';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ParkingPin, Review } from '../types';
import { usePhotoPicker } from '../hooks/usePhotoPicker';
import {
  incrementStat,
  logActivityLocal,
  getFootprintsBySpot,
} from '../db/database';
import type { Footprint } from '../db/database';
import {
  addReview,
  fetchReviews,
  reportParked,
  incrementViewCount,
} from '../firebase/firestoreService';
import { getFirstVehicle, addFootprint } from '../db/database';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { captureError } from '../utils/sentry';
import { useUser } from '../contexts/UserContext';
import { spotFreshness, freshnessLabel, lastConfirmedText, FRESHNESS_STYLE } from '../utils/freshness';

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
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days === 0) return '今日';
  if (days === 1) return '昨日';
  if (days < 7) return '今週';
  if (days < 30) return '今月';
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

// ─── Props ────────────────────────────────────────────
interface Props {
  spot: ParkingPin;
  onClose: () => void;
  onSpotSelect?: (spot: ParkingPin) => void;
  onSpotUpdated?: () => void;
  onOneshotCeremony?: (data: { photoUri: string; spotName: string }) => void;
  highlightReviewId?: string;
  nickname?: string;
}


// ─── メインコンポーネント ──────────────────────────────
export function SpotDetailSheet({ spot, onClose, onSpotSelect, onSpotUpdated, onOneshotCeremony, highlightReviewId, nickname }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const user = useUser();
  const tutorial = useTutorial();
  const { showPicker, PickerSheet } = usePhotoPicker();
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

  // Reports (旧 reviews)
  const [reports, setReports]           = useState<Review[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  // ワンショット
  const [shotUploading, setShotUploading] = useState(false);


  // 自分の足跡（自分のノート）
  const [myFootprints, setMyFootprints] = useState<Footprint[]>([]);

  // Fullscreen photo
  const [fullPhoto, setFullPhoto] = useState<string | null>(null);

  // ナビ選択モーダル
  const [navModalOpen, setNavModalOpen] = useState(false);

  // ワンショット後のリフレッシュ用
  const loadAll = useCallback(async () => {
    setReportsLoading(true);
    const [r, fp] = await Promise.all([
      fetchReviews(spot.id, 'date'),
      getFootprintsBySpot(spot.id),
    ]);
    setReports(r);
    setMyFootprints(fp);
    setReportsLoading(false);
  }, [spot.id]);

  // ── 初期ロード（spot変更時は前のリクエストを無視） ───────
  useEffect(() => {
    if (tutorial.active && spot.id === '_tutorial_spot_') {
      const asset = Asset.fromModule(require('../../assets/tutorial-parking.jpg'));
      asset.downloadAsync().then(() => {
        setReports([
          { id: 901, spotId: spot.id, source: 'seed', score: 1, comment: '広くて停めやすい！', photoUri: asset.localUri ?? asset.uri, createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
          { id: 902, spotId: spot.id, source: 'seed', score: 1, comment: null, photoUri: null, createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
          { id: 903, spotId: spot.id, source: 'seed', score: 0, comment: '[full] 土日は満車多い', photoUri: null, createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() },
        ]);
      });

      setReportsLoading(false);
      return;
    }

    let stale = false;
    setReportsLoading(true);
    fetchReviews(spot.id, 'date').then((r) => {
      if (stale) return;
      setReports(r);
      setReportsLoading(false);
    });
    incrementViewCount(spot.id);
    logActivityLocal('spot_view', `${spot.name}を表示`);
    return () => { stale = true; };
  }, [spot.id, tutorial.active]);

  // ── ナビゲーション ────────────────────────────────────
  const openGoogleMaps = () => {
    const lat = spot.latitude;
    const lng = spot.longitude;
    if (!lat || !lng) return;
    // google.navigation: で直接ターンバイターンナビを開始
    const directNav = `google.navigation:q=${lat},${lng}`;
    Linking.openURL(directNav).catch(() =>
      Linking.openURL(`https://maps.google.com/maps?daddr=${lat},${lng}`)
    );
  };

  const openYahooNavi = async () => {
    const lat = spot.latitude;
    const lng = spot.longitude;
    if (!lat || !lng) return;
    const name = spot.name?.trim() ? encodeURIComponent(spot.name) : '';
    const namePart = name ? `&name=${name}` : '';
    const newLink = `ynavigation://v1/route?lat=${lat}&lon=${lng}${namePart}&type=drive`;
    const oldLink = `yjnavicar://v1/map?lat=${lat}&lon=${lng}${namePart}`;
    // iOS: canOpenURL で確認してから開く
    if (Platform.OS === 'ios') {
      const canNew = await Linking.canOpenURL(newLink);
      if (canNew) { await Linking.openURL(newLink); return; }
      const canOld = await Linking.canOpenURL(oldLink);
      if (canOld) { await Linking.openURL(oldLink); return; }
    } else {
      // Android: canOpenURL が <queries> 未宣言だとfalseになるため直接試す
      try { await Linking.openURL(newLink); return; } catch { /* fall through */ }
      try { await Linking.openURL(oldLink); return; } catch { /* fall through */ }
    }
    // 両方失敗 → 未インストール → ストアへ誘導
    const store = Platform.select({
      android: 'https://play.google.com/store/apps/details?id=jp.co.yahoo.android.apps.navi',
      ios: 'https://apps.apple.com/jp/app/yahoo-%E3%82%AB%E3%83%BC%E3%83%8A%E3%83%93/id890808217',
    });
    Alert.alert(
      'Yahoo!カーナビ',
      'アプリがインストールされていません',
      [
        { text: 'ストアを開く', onPress: () => { if (store) Linking.openURL(store); } },
        { text: 'OK', style: 'cancel' },
      ],
    );
  };

  const handleCopyAddress = async () => {
    const t = spot.address ? `${spot.name}\n${spot.address}` : `${spot.name}\n${spot.latitude}, ${spot.longitude}`;
    await Clipboard.setStringAsync(t);
    Alert.alert('コピーしました', spot.address ?? `${spot.latitude}, ${spot.longitude}`);
  };

  const handleNav = () => {
    setNavModalOpen(true);
  };

  // ── ワンショット: カメラ → アップロード → 鮮度更新 ─────
  const handleOneShot = async () => {
    if (shotUploading) return;
    const uri = await showPicker();
    if (!uri) return; // キャンセル

    let userId = user?.userId;
    if (!userId) {
      userId = await AsyncStorage.getItem('moto_logos_device_id') ?? undefined;
    }
    if (!userId) { Alert.alert('エラー', 'ユーザー情報を読み込めません。アプリを再起動してください。'); return; }

    setShotUploading(true);
    try {
      const bike = await getFirstVehicle();

      // Firestore review + Storage アップロード（既存関数を再利用）
      await addReview(spot.id, userId, 1, undefined, uri, undefined, bike?.name, undefined, nickname);

      // 鮮度更新（副産物）
      reportParked(spot.id).catch((e) => captureError(e, { context: 'oneshot_parked', spotId: spot.id }));

      // ローカル足跡
      addFootprint(spot.id, spot.name, spot.latitude, spot.longitude, 'parked');

      // ローカル記録
      AsyncStorage.setItem(`vote_${spot.id}`, 'matched');
      logActivityLocal('report', `${spot.name}をワンショット`);
      incrementStat('reports');

      // セレモニー演出をトリガー（ハプティックはセレモニー内で実行）
      onOneshotCeremony?.({ photoUri: uri, spotName: spot.name });
      onSpotUpdated?.();
      await loadAll();
    } catch (e: unknown) {
      captureError(e, { context: 'oneshot' });
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('保存に失敗しました', message);
    } finally {
      setShotUploading(false);
      // 一時ファイル削除
      FileSystem.deleteAsync(uri, { idempotent: true }).catch((e) => captureError(e, { context: 'temp_file_cleanup' }));
    }
  };

  // ─────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────
  const photos = reports.filter((r) => r.photoUri);

  return (
    <>
      {/* ── ナビ選択モーダル ────────────────────── */}
      <Modal
        visible={navModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setNavModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.navModalOverlay}
          activeOpacity={1}
          onPress={() => setNavModalOpen(false)}
        >
          <View style={styles.navModalContent}>
            <Text style={styles.navModalTitle}>案内開始</Text>
            <Text style={styles.navModalSub} numberOfLines={2}>{spot.name}</Text>

            <TouchableOpacity
              style={styles.navModalOption}
              onPress={() => { setNavModalOpen(false); openGoogleMaps(); }}
            >
              <Ionicons name="navigate-circle" size={22} color={C.blue} />
              <Text style={styles.navModalOptionText}>Googleマップ</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navModalOption}
              onPress={() => { setNavModalOpen(false); openYahooNavi(); }}
            >
              <Ionicons name="car" size={22} color="#FF0033" />
              <Text style={styles.navModalOptionText}>Yahoo!カーナビ</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navModalOption}
              onPress={() => { setNavModalOpen(false); handleCopyAddress(); }}
            >
              <Ionicons name="copy-outline" size={22} color={C.sub} />
              <Text style={styles.navModalOptionText}>住所をコピー</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navModalCancel}
              onPress={() => setNavModalOpen(false)}
            >
              <Text style={styles.navModalCancelText}>キャンセル</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* フルスクリーン写真 */}
      {fullPhoto && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setFullPhoto(null)}>
          <TouchableOpacity style={styles.fullscreenBg} activeOpacity={1} onPress={() => setFullPhoto(null)}>
            <Image source={fullPhoto} style={styles.fullscreenImage} contentFit="contain" />
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
              <FreshnessBadge spot={spot} />
            </View>

            {/* 鮮度テキスト */}
            <FreshnessText spot={spot} />

            {/* 情報更新日 */}
            <InfoUpdatedAt spot={spot} />

            {/* 写真ギャラリー */}
            {photos.length > 0 ? (
              <View style={styles.gallerySection}>
                <FlatList
                  horizontal
                  data={photos}
                  keyExtractor={(r) => `photo_${r.firestoreId ?? r.id}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.galleryList}
                  initialNumToRender={3}
                  maxToRenderPerBatch={3}
                  windowSize={3}
                  removeClippedSubviews
                  getItemLayout={(_, index) => ({ length: 138, offset: 138 * index, index })}
                  renderItem={({ item }) => (
                    <TouchableOpacity onPress={() => setFullPhoto(item.photoUri!)} activeOpacity={0.85}>
                      <View>
                        <Image source={item.photoUri!} style={styles.galleryThumb} transition={200} cachePolicy="disk" />
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
                {reports.map((r) => {
                  const isHighlight = !!(highlightReviewId && r.firestoreId === highlightReviewId);
                  return (
                    <View
                      key={r.firestoreId ?? String(r.id)}
                      style={isHighlight ? styles.highlightWrap : undefined}
                      onLayout={isHighlight ? (e) => {
                        const y = e.nativeEvent.layout.y;
                        setTimeout(() => scrollRef.current?.scrollTo({ y: y + 200, animated: true }), 400);
                      } : undefined}
                    >
                      <ReportCard report={r} onPhotoTap={setFullPhoto} />
                    </View>
                  );
                })}
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
                    'GoogleマップやYahoo!カーナビで案内が始まります',
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
              style={[styles.footerShotBtn, shotUploading && { opacity: 0.5 }]}
              onPress={handleOneShot}
              activeOpacity={0.8}
              accessibilityLabel="ワンショット"
              accessibilityRole="button"
              accessibilityHint="カメラで写真を撮り、自分のノートに保存します"
              accessibilityState={{ disabled: shotUploading }}
            >
              {shotUploading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="camera" size={17} color="#fff" />}
              <Text style={styles.footerShotText}>ワンショット</Text>
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
      <PickerSheet />
    </>
  );
}

// ─── 鮮度バッジ（霧の状態） ─────────────────────────
function FreshnessBadge({ spot }: { spot: ParkingPin }) {
  const fresh = spotFreshness(spot);
  const color = FRESHNESS_STYLE[fresh].color;
  const label = freshnessLabel(fresh);
  return (
    <View style={[styles.badge, { backgroundColor: `${color}18`, borderWidth: StyleSheet.hairlineWidth, borderColor: `${color}44` }]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginRight: 4 }} />
      <Text style={[styles.badgeText, { color, fontSize: 10, fontWeight: '600' }]}>{label}</Text>
    </View>
  );
}

// ─── 鮮度テキスト（「X日前に確認」/「まだ誰も確認していません」） ──
function FreshnessText({ spot }: { spot: ParkingPin }) {
  const fresh = spotFreshness(spot);
  const text = lastConfirmedText(spot);
  const color = fresh === 'foggy' ? C.accent : FRESHNESS_STYLE[fresh].color;
  const icon = fresh === 'foggy' ? 'footsteps-outline' : 'checkmark-circle-outline';
  return (
    <View style={styles.temperatureRow}>
      <Ionicons name={icon as 'time-outline'} size={14} color={color} />
      <Text style={[styles.temperatureText, { color }]}>{text}</Text>
    </View>
  );
}

// ─── 情報更新日（「情報更新: 2026-04-17」） ─────────────
function InfoUpdatedAt({ spot }: { spot: ParkingPin }) {
  const dateStr = spot.updatedAt;
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  let label: string;
  if (diffDays === 0) label = '今日更新';
  else if (diffDays === 1) label = '昨日更新';
  else if (diffDays < 30) label = `${diffDays}日前に更新`;
  else if (diffDays < 365) label = `${Math.floor(diffDays / 30)}ヶ月前に更新`;
  else label = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} 更新`;
  return (
    <View style={styles.temperatureRow}>
      <Ionicons name="document-text-outline" size={14} color={C.sub} />
      <Text style={[styles.temperatureText, { color: C.sub }]}>情報 {label}</Text>
    </View>
  );
}

// ─── 自分のノート（自分の写真 + 足跡回数） ─────────────
function MyNotes({ reports, footprints, userId, onPhotoTap }: {
  reports: Review[];
  footprints: Footprint[];
  userId: string | null;
  onPhotoTap: (uri: string) => void;
}) {
  // 自分の写真付きレビューを抽出
  const myPhotos = useMemo(() => {
    if (!userId) return [];
    return reports.filter((r) => r.userId === userId && r.photoUri);
  }, [reports, userId]);

  if (myPhotos.length === 0 && footprints.length === 0) return null;

  return (
    <View style={styles.myMemoSection}>
      <Text style={styles.myMemoLabel}>自分のノート</Text>
      {myPhotos.length > 0 && (
        <FlatList
          horizontal
          data={myPhotos}
          keyExtractor={(r) => `my_${r.firestoreId ?? r.id}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.myNotePhotos}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={3}
          removeClippedSubviews
          getItemLayout={(_, index) => ({ length: 108, offset: 108 * index, index })}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => onPhotoTap(item.photoUri!)} activeOpacity={0.85}>
              <View>
                <Image source={item.photoUri!} style={styles.myNoteThumb} transition={200} cachePolicy="disk" />
                <View style={styles.myNoteDateBadge}>
                  <Text style={styles.myNoteDateText}>
                    {new Date(item.createdAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
      {footprints.length > 0 && (
        <View style={styles.myMemoCard}>
          <Ionicons name="footsteps" size={14} color={C.green} />
          <Text style={styles.myMemoText}>
            {footprints.length}回停めた（最終: {new Date(footprints[0].createdAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}）
          </Text>
        </View>
      )}
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
            <Ionicons name="camera" size={13} color={C.green} />
            <Text style={[styles.reportCardBadgeText, { color: C.green }]}>ワンショット</Text>
          </View>
        )}
        {isUnmatched && (
          <View style={styles.reportCardBadge}>
            <Ionicons name="alert-circle" size={13} color={correctionInfo?.color ?? C.orange} />
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
      {(report.nickname || report.vehicleName) ? (
        <Text style={styles.reportCardVehicle}>
          {[report.nickname, report.vehicleName].filter(Boolean).join(' — ')}
        </Text>
      ) : null}
      {cleanComment ? (
        <Text style={styles.reportCardComment}>{cleanComment}</Text>
      ) : null}
      {report.photoUri && (
        <TouchableOpacity onPress={() => onPhotoTap(report.photoUri!)} activeOpacity={0.85} style={{ marginTop: 8 }}>
          <Image source={report.photoUri} style={styles.reportCardPhoto} transition={200} cachePolicy="disk" />
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

  // Badges
  badgeRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  badge:          { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeMuted:     { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  badgeText:      { color: '#fff', fontSize: 12, fontWeight: '600' },
  badgeTextMuted: { color: C.sub, fontSize: 12 },

  // Freshness
  temperatureRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  temperatureText: { fontSize: 13, fontWeight: '500' },

  // 自分のメモ
  myMemoSection: { marginTop: 12 },
  myMemoLabel: { fontSize: 11, color: C.sub, fontWeight: '600', marginBottom: 6 },
  myMemoCard: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(48,209,88,0.08)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  myMemoText: { fontSize: 12, color: C.text, fontWeight: '500' },

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
  footerShotBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#FF6B00', borderRadius: 14, paddingVertical: 14,
  },
  footerShotText: { color: '#fff', fontSize: FontSize.md, fontWeight: '600' },
  footerShareBtn: {
    width: 50, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(10,132,255,0.12)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(10,132,255,0.3)',
  },

  // 自分のノート写真
  myNotePhotos: { gap: 8, paddingVertical: 4 },
  myNoteThumb:  { width: 100, height: 74, borderRadius: 10, backgroundColor: C.card },
  myNoteDateBadge: { position: 'absolute', bottom: 3, left: 3, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  myNoteDateText:  { color: '#fff', fontSize: 9, fontWeight: '600' },

  // Fullscreen
  fullscreenBg:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  fullscreenImage: { width: '100%', height: '80%' },
  fullscreenClose: { position: 'absolute', top: 56, right: 20 },

  // Nav modal
  navModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  navModalContent: { backgroundColor: C.sheet, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 36 },
  navModalTitle: { color: C.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  navModalSub: { color: C.sub, fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  navModalOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  navModalOptionText: { color: C.text, fontSize: 16 },
  navModalCancel: { marginTop: 12, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: C.card },
  navModalCancelText: { color: C.sub, fontSize: 15, fontWeight: '600' },
  highlightWrap: {
    borderWidth: 2,
    borderColor: C.accent,
    borderRadius: 14,
    marginHorizontal: -2,
  },
});
