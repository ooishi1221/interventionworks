/**
 * SpotDetailSheet
 * 駐輪場詳細シート — Apple Maps 風モダンデザイン
 * - レビューサマリー（平均★ + 件数）→ タップでアンカースクロール
 * - 横スクロール写真ギャラリー（フルスクリーン拡大対応）
 * - 精算方法アイコン＋料金表
 * - 口コミ投稿（星のみ / コメント+写真付き）
 * - レビュー一覧（最新順 / 評価高い順）
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
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { ParkingPin, Review, ReviewSummary } from '../types';
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
  fetchReviewSummary,
  fetchSpotCounts,
  deleteReviewFromFirestore,
  reportSpotGood,
  reportSpotFull,
  reportSpotClosed,
} from '../firebase/firestoreService';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';
import { captureError } from '../utils/sentry';
import { useUser } from '../contexts/UserContext';

const { height: SCREEN_H } = Dimensions.get('window');

// ─── カラー定数 ────────────────────────────────────────
const C = {
  bg:       '#000000',
  sheet:    '#1C1C1E',
  card:     '#2C2C2E',
  border:   'rgba(255,255,255,0.10)',
  text:     '#F2F2F7',
  sub:      '#8E8E93',
  blue:     '#0A84FF',
  green:    '#30D158',
  red:      '#FF453A',
  orange:   '#FF9F0A',
  purple:   '#BF5AF2',
  pink:     '#FF375F',
  hairline: 'rgba(255,255,255,0.08)',
};

// ─── CC ラベル ─────────────────────────────────────────
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

// ─── Props ────────────────────────────────────────────
interface Props {
  spot: ParkingPin;
  onClose: () => void;
}

// ─── メインコンポーネント ──────────────────────────────
export function SpotDetailSheet({ spot, onClose }: Props) {
  const scrollRef      = useRef<ScrollView>(null);
  const [reviewsTop, setReviewsTop] = useState(0);

  // 下スワイプで閉じるアニメーション
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const swipePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 10,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) sheetTranslateY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80) {
          // 閾値超え → 閉じる
          Animated.timing(sheetTranslateY, { toValue: 500, duration: 200, useNativeDriver: true }).start(onClose);
        } else {
          // 戻す
          Animated.spring(sheetTranslateY, { toValue: 0, tension: 200, friction: 15, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  // Favorites
  const [isFav, setIsFav]             = useState(false);
  const [favLoading, setFavLoading]   = useState(false);

  // Reviews
  const [summary, setSummary]           = useState<ReviewSummary | null>(null);
  const [reviews, setReviews]           = useState<Review[]>([]);
  const [sortOrder, setSortOrder]       = useState<'date' | 'score'>('date');
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // Add-review form
  const [formVisible, setFormVisible]   = useState(false);
  const [newScore, setNewScore]         = useState(0);
  const [newComment, setNewComment]     = useState('');
  const [newPhoto, setNewPhoto]         = useState<string | null>(null);
  const [submitting, setSubmitting]     = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const user = useUser();

  // Fullscreen photo
  const [fullPhoto, setFullPhoto]       = useState<string | null>(null);

  // ── 初期ロード ───────────────────────────────────────
  const loadAll = useCallback(async () => {
    const src = spot.source as 'seed' | 'user';
    setReviewsLoading(true);
    const [favs, s, r] = await Promise.all([
      getAllFavorites(),
      fetchReviewSummary(spot.id),
      fetchReviews(spot.id, sortOrder),
    ]);
    setIsFav(favs.some((f) => f.spotId === spot.id && f.source === src));
    setSummary(s);
    setReviews(r);
    setReviewsLoading(false);
  }, [spot, sortOrder]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── お気に入りトグル ──────────────────────────────────
  const toggleFav = async () => {
    setFavLoading(true);
    const src = spot.source as 'seed' | 'user';
    try {
      if (isFav) { await removeFavorite(spot.id, src); setIsFav(false); }
      else       { await addFavorite(spot.id, src);    setIsFav(true);  }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
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
    } catch { /* navi app not installed */ }
    Linking.openURL(web).catch((e) => captureError(e, { context: 'yahoo_navi' }));
  };

  const handleNav = () => {
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

  // ── 写真ピッカー ──────────────────────────────────────
  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('写真へのアクセスが必要です', '設定から許可してください。');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled) setNewPhoto(result.assets[0].uri);
  };

  /** 一時写真ファイルを削除してステートをクリア */
  const clearPhoto = useCallback(async () => {
    if (newPhoto) {
      FileSystem.deleteAsync(newPhoto, { idempotent: true }).catch(() => {});
    }
    setNewPhoto(null);
  }, [newPhoto]);

  // ── レビュー投稿 ──────────────────────────────────────
  const submitReview = async () => {
    if (newScore === 0) { Alert.alert('星評価を選んでください'); return; }
    if (!user) { Alert.alert('ユーザー情報を読み込み中です'); return; }
    setSubmitting(true);
    setUploadProgress(0);
    try {
      await addReview(
        spot.id,
        user.userId,
        newScore,
        newComment.trim() || undefined,
        newPhoto ?? undefined,
        (p) => setUploadProgress(p),
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      logActivityLocal('review', `${spot.name}に口コミを投稿`, `${newScore}点`);
      setNewScore(0); setNewComment(''); clearPhoto();
      setFormVisible(false);
      await loadAll();
    } catch (e) {
      captureError(e, { context: 'submitReview' });
      Alert.alert('保存に失敗しました');
    }
    setSubmitting(false);
  };

  // ── レビュー削除 ──────────────────────────────────────
  const confirmDelete = (review: Review) => {
    Alert.alert('レビューを削除', 'このレビューを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: async () => {
          if (review.firestoreId) {
            await deleteReviewFromFirestore(review.firestoreId);
          }
          await loadAll();
        }},
    ]);
  };

  // ── アンカースクロール ─────────────────────────────────
  const scrollToReviews = () => {
    scrollRef.current?.scrollTo({ y: reviewsTop - 8, animated: true });
  };

  // ─────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────
  const photos = reviews.filter((r) => r.photoUri);

  return (
    <>
      {/* フルスクリーン写真 */}
      {fullPhoto && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setFullPhoto(null)}>
          <TouchableOpacity
            style={styles.fullscreenBg}
            activeOpacity={1}
            onPress={() => setFullPhoto(null)}
          >
            <Image source={{ uri: fullPhoto }} style={styles.fullscreenImage} resizeMode="contain" />
            <TouchableOpacity style={styles.fullscreenClose} onPress={() => setFullPhoto(null)}>
              <Ionicons name="close-circle" size={36} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* バックドロップ */}
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

      {/* シート */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrapper}
      >
        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}>
          {/* スワイプハンドル */}
          <View {...swipePan.panHandlers} style={styles.handleArea}>
            <View style={styles.handle} />
          </View>
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >

            {/* ── ヘッダー ─────────────────────────── */}
            <View style={styles.titleRow}>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={28} color={C.sub} />
              </TouchableOpacity>
              <Text style={styles.spotName} numberOfLines={2}>{spot.name}</Text>
              <TouchableOpacity style={styles.favBtn} onPress={toggleFav} disabled={favLoading}>
                <Ionicons
                  name={isFav ? 'heart' : 'heart-outline'}
                  size={26}
                  color={C.pink}
                />
              </TouchableOpacity>
            </View>

            {/* ── レビューサマリー（アンカーリンク） ── */}
            {summary && (
            <TouchableOpacity style={styles.summaryRow} onPress={scrollToReviews} activeOpacity={0.7}>
                  <View style={styles.summaryStars}>
                    {[1,2,3,4,5].map((s) => (
                      <Ionicons
                        key={s}
                        name={s <= Math.round(summary.avg) ? 'star' : 'star-outline'}
                        size={14}
                        color="#FFD60A"
                      />
                    ))}
                  </View>
                  <Text style={styles.summaryAvg}>{summary.avg.toFixed(1)}</Text>
                  <Text style={styles.summaryCount}>（{summary.count}件）</Text>
                  <Ionicons name="chevron-forward" size={13} color={C.sub} />
            </TouchableOpacity>
            )}

            {/* ── バッジ ────────────────────────────── */}
            <View style={styles.badgeRow}>
              {spot.source === 'user' && (
                <View style={[styles.badge, { backgroundColor: C.purple }]}>
                  <Text style={styles.badgeText}>ユーザー登録</Text>
                </View>
              )}
              <View style={[styles.badge, { backgroundColor: markerColor(spot) }]}>
                <Text style={styles.badgeText}>{ccLabel(spot.maxCC)}</Text>
              </View>
              {spot.isFree === true  && (
                <View style={[styles.badge, { backgroundColor: C.green }]}>
                  <Text style={styles.badgeText}>無料</Text>
                </View>
              )}
              {spot.isFree === false && (
                <View style={[styles.badge, styles.badgeMuted]}>
                  <Text style={styles.badgeTextMuted}>有料</Text>
                </View>
              )}
              {spot.capacity != null && (
                <View style={[styles.badge, styles.badgeMuted]}>
                  <Text style={styles.badgeTextMuted}>{spot.capacity}台</Text>
                </View>
              )}
              <FreshnessBadge updatedAt={spot.updatedAt} />
            </View>

            {/* ── 写真ギャラリー（バッジ直下、目立つ位置） ── */}
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
                      <Image source={{ uri: item.photoUri! }} style={styles.galleryThumb} />
                    </TouchableOpacity>
                  )}
                />
              </View>
            ) : (
              <View style={styles.noPhotoHint}>
                <Ionicons name="camera-outline" size={16} color={C.sub} />
                <Text style={styles.noPhotoText}>まだ写真がありません — 最初の1枚を投稿しよう</Text>
              </View>
            )}

            {/* ── 住所 ─────────────────────────────── */}
            {spot.address && (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={15} color={C.sub} />
                <Text style={styles.metaText}>{spot.address}</Text>
              </View>
            )}

            {/* ── 精算・料金情報 ────────────────────── */}
            <PaymentSection spot={spot} />

            {/* ── 案内 + シェア ──────────────────────── */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.navBtn} onPress={handleNav} activeOpacity={0.85}>
                <Ionicons name="navigate" size={17} color="#fff" />
                <Text style={styles.navBtnText}>案内開始</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.shareBtn}
                activeOpacity={0.75}
                onPress={() => {
                  const url = `https://maps.google.com/maps?q=${spot.latitude},${spot.longitude}`;
                  Share.share({
                    message: `${spot.name}\n${spot.address ?? ''}\n${url}\n\n— Moto-Logos で共有`,
                  });
                }}
              >
                <Ionicons name="share-outline" size={20} color={C.blue} />
              </TouchableOpacity>
            </View>

            {/* ── ステータス報告 ───────────────────── */}
            <StatusReportButtons spotId={spot.id} spotName={spot.name} />

            {/* ── レビューセクション ────────────────── */}
            <View
              onLayout={(e) => setReviewsTop(e.nativeEvent.layout.y)}
              style={styles.reviewsSection}
            >
              {/* ヘッダー + ソート */}
              <View style={styles.reviewsHeader}>
                <Text style={styles.sectionLabel}>
                  口コミ{summary ? `  ★${summary.avg.toFixed(1)}` : ''}
                </Text>
                <View style={styles.sortRow}>
                  {(['date', 'score'] as const).map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.sortBtn, sortOrder === s && styles.sortBtnActive]}
                      onPress={() => setSortOrder(s)}
                    >
                      <Text style={[styles.sortBtnText, sortOrder === s && styles.sortBtnTextActive]}>
                        {s === 'date' ? '最新順' : '評価順'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* レビュー一覧 */}
              {reviewsLoading ? (
                <ActivityIndicator color={C.blue} style={{ marginVertical: 20 }} />
              ) : reviews.length === 0 ? (
                <View style={styles.emptyReviews}>
                  <Ionicons name="chatbubble-outline" size={32} color={C.sub} />
                  <Text style={styles.emptyText}>まだ口コミがありません</Text>
                </View>
              ) : (
                reviews.map((r) => (
                  <ReviewCard
                    key={r.firestoreId ?? String(r.id)}
                    review={r}
                    onDelete={() => confirmDelete(r)}
                    onPhotoTap={setFullPhoto}
                  />
                ))
              )}

              {/* レビュー投稿ボタン / フォーム */}
              {!formVisible ? (
                <TouchableOpacity style={styles.addReviewBtn} onPress={() => setFormVisible(true)}>
                  <Ionicons name="add-circle-outline" size={18} color={C.blue} />
                  <Text style={styles.addReviewBtnText}>口コミを投稿する</Text>
                </TouchableOpacity>
              ) : (
                <ReviewForm
                  score={newScore}
                  comment={newComment}
                  photo={newPhoto}
                  submitting={submitting}
                  uploadProgress={uploadProgress}
                  onScoreChange={setNewScore}
                  onCommentChange={setNewComment}
                  onPickPhoto={pickPhoto}
                  onRemovePhoto={clearPhoto}
                  onSubmit={submitReview}
                  onCancel={() => { setFormVisible(false); setNewScore(0); setNewComment(''); clearPhoto(); }}
                />
              )}
            </View>

            <View style={{ height: 32 }} />
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </>
  );
}

// ─── 鮮度バッジ ──────────────────────────────────────
function FreshnessBadge({ updatedAt }: { updatedAt?: string }) {
  if (!updatedAt) return null;
  const diffMs = Date.now() - new Date(updatedAt).getTime();
  const days = Math.floor(diffMs / 86400000);

  let label: string;
  let color: string;
  let icon: 'checkmark-circle' | 'alert-circle' | 'warning' = 'checkmark-circle';

  if (days <= 30) {
    label = days <= 1 ? '最新' : `${days}日前`;
    color = C.blue;
    icon = 'checkmark-circle';
  } else if (days <= 90) {
    const months = Math.floor(days / 30);
    label = `${months}ヶ月前`;
    color = C.orange;
    icon = 'alert-circle';
  } else {
    const months = Math.floor(days / 30);
    label = months >= 12 ? `${Math.floor(months / 12)}年以上前` : `${months}ヶ月前`;
    color = C.red;
    icon = 'warning';
  }

  return (
    <View style={[styles.badge, { backgroundColor: `${color}18`, borderWidth: StyleSheet.hairlineWidth, borderColor: `${color}44` }]}>
      <Ionicons name={icon} size={10} color={color} style={{ marginRight: 2 }} />
      <Text style={[styles.badgeText, { color, fontSize: 10, fontWeight: '600' }]}>{label}</Text>
    </View>
  );
}

// ─── ステータス報告ボタン（3分割 + 駐車タイマー） ────────
function StatusReportButtons({ spotId, spotName }: { spotId: string; spotName: string }) {
  const [reported, setReported] = useState<'good' | 'full' | 'closed' | null>(null);
  const [showTimer, setShowTimer] = useState(false);
  const [goodCount, setGoodCount]     = useState(0);
  const [badCount, setBadCount]       = useState(0);
  const [alreadyVoted, setAlreadyVoted] = useState(false);

  useEffect(() => {
    (async () => {
      const [counts, prev] = await Promise.all([
        fetchSpotCounts(spotId),
        AsyncStorage.getItem(`vote_${spotId}`),
      ]);
      setGoodCount(counts.goodCount);
      setBadCount(counts.badReportCount);
      setAlreadyVoted(!!prev);
    })();
  }, [spotId]);

  const scheduleTimer = async (minutes: number) => {
    try {
      await Notifications.requestPermissionsAsync();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '駐車タイマー',
          body: `${spotName} の駐車時間が ${minutes}分 経過しました。移動の準備を!`,
          sound: true,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: minutes * 60 },
      });
    } catch {
      // Expo Go (Android SDK53+) では通知非対応 → Alertで代替通知
      Alert.alert('タイマーセット', `${minutes}分後にお知らせします\n(※開発ビルドで通知が届きます)`);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowTimer(false);
  };

  const handle = (type: 'good' | 'full' | 'closed') => {
    if (reported || alreadyVoted) return;
    if (type === 'closed') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        '閉鎖を報告',
        'このスポットが閉鎖されたことを報告します。\n他のライダーに警告が表示されます。',
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '報告する',
            style: 'destructive',
            onPress: () => {
              setReported('closed');
              setAlreadyVoted(true);
              setBadCount((c) => c + 3);
              AsyncStorage.setItem(`vote_${spotId}`, 'closed');
              logActivityLocal('report', `${spotName}を閉鎖報告`);
              reportSpotClosed(spotId).catch((e) => {
                captureError(e, { context: 'report_closed' });
                Alert.alert('送信エラー', '報告の送信に失敗しました。');
              });
              incrementStat('reports');
            },
          },
        ]
      );
    } else if (type === 'full') {
      setReported('full');
      setAlreadyVoted(true);
      setBadCount((c) => c + 1);
      AsyncStorage.setItem(`vote_${spotId}`, 'full');
      logActivityLocal('report', `${spotName}を満車報告`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      reportSpotFull(spotId).catch((e) => {
        captureError(e, { context: 'report_full' });
        Alert.alert('送信エラー', '報告の送信に失敗しました。');
      });
      incrementStat('reports');
    } else {
      setReported('good');
      setAlreadyVoted(true);
      setGoodCount((c) => c + 1);
      AsyncStorage.setItem(`vote_${spotId}`, 'good');
      logActivityLocal('report', `${spotName}を停められた報告`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reportSpotGood(spotId).catch((e) => {
        captureError(e, { context: 'report_good' });
        Alert.alert('送信エラー', '報告の送信に失敗しました。');
      });
      incrementStat('reports');
      // 👍の後にタイマー選択肢を表示
      setShowTimer(true);
    }
  };

  const MSGS: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; text: string }> = {
    good:   { icon: 'checkmark-circle', color: C.green,  text: '報告ありがとう!' },
    full:   { icon: 'alert-circle',     color: C.orange, text: '満車情報を共有しました' },
    closed: { icon: 'close-circle',     color: C.red,    text: '閉鎖報告を共有しました' },
  };

  if (reported) {
    const msg = MSGS[reported];
    return (
      <View style={styles.statusReportedSection}>
        <View style={styles.statusReported}>
          <Ionicons name={msg.icon} size={18} color={msg.color} />
          <Text style={[styles.statusReportedText, { color: msg.color }]}>{msg.text}</Text>
        </View>
        {/* 駐車タイマー（👍後のみ） */}
        {showTimer && (
          <View style={styles.timerSection}>
            <Text style={styles.timerLabel}>駐車タイマーをセット？</Text>
            <View style={styles.timerRow}>
              {[30, 60, 120].map((m) => (
                <TouchableOpacity key={m} style={styles.timerBtn} onPress={() => scheduleTimer(m)} activeOpacity={0.7}>
                  <Ionicons name="alarm-outline" size={16} color={C.blue} />
                  <Text style={styles.timerBtnText}>{m >= 60 ? `${m / 60}時間` : `${m}分`}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.timerSkip} onPress={() => setShowTimer(false)}>
                <Text style={styles.timerSkipText}>なし</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.statusSection}>
      <Text style={styles.statusLabel}>
        {alreadyVoted ? 'このスポットは報告済みです' : 'いまの状況を仲間に共有'}
      </Text>
      <View style={styles.statusRow}>
        <TouchableOpacity style={[styles.statusGood, alreadyVoted && { opacity: 0.4 }]} onPress={() => handle('good')} activeOpacity={0.75} disabled={alreadyVoted}>
          <Ionicons name="checkmark-circle" size={18} color="#fff" />
          <Text style={styles.statusBtnText}>停められた</Text>
          {goodCount > 0 && <Text style={styles.statusCountBadge}>{goodCount}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.statusFull, alreadyVoted && { opacity: 0.4 }]} onPress={() => handle('full')} activeOpacity={0.75} disabled={alreadyVoted}>
          <Ionicons name="time" size={18} color="#fff" />
          <Text style={styles.statusBtnText}>満車</Text>
          {badCount > 0 && <Text style={styles.statusCountBadge}>{badCount}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.statusClosed, alreadyVoted && { opacity: 0.4 }]} onPress={() => handle('closed')} activeOpacity={0.75} disabled={alreadyVoted}>
          <Ionicons name="close-circle" size={18} color="#fff" />
          <Text style={styles.statusBtnText}>閉鎖</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── 精算・料金セクション ──────────────────────────────
function PaymentSection({ spot }: { spot: ParkingPin }) {
  const hasPrice = spot.isFree === false;
  const hasPriceInfo = spot.pricePerHour != null;
  const hasHours = !!spot.openHours;

  if (!hasPrice && !hasPriceInfo && !hasHours) {
    // 無料 or 情報なし
    if (spot.isFree === true) {
      return (
        <View style={styles.paymentRow}>
          <Ionicons name="checkmark-circle" size={16} color={C.green} />
          <Text style={[styles.paymentText, { color: C.green }]}>無料で駐輪できます</Text>
        </View>
      );
    }
    return null;
  }

  return (
    <View style={styles.paymentCard}>
      {/* 料金 */}
      {hasPriceInfo && (
        <View style={styles.paymentRow}>
          <Ionicons name="time-outline" size={15} color={C.sub} />
          <View style={styles.paymentContent}>
            <Text style={styles.paymentLabel}>料金</Text>
            <Text style={styles.paymentValue}>
              ¥{spot.pricePerHour?.toLocaleString()} / 時間
            </Text>
          </View>
        </View>
      )}

      {hasPrice && !hasPriceInfo && (
        <View style={styles.paymentRow}>
          <Ionicons name="cash-outline" size={15} color={C.sub} />
          <View style={styles.paymentContent}>
            <Text style={styles.paymentLabel}>精算方法</Text>
            <View style={styles.paymentMethodIcons}>
              <PayMethodBadge icon="cash-outline"          label="現金" />
              <PayMethodBadge icon="card-outline"          label="IC/Card" />
              <PayMethodBadge icon="phone-portrait-outline" label="QRコード" />
            </View>
          </View>
        </View>
      )}

      {/* 営業時間 */}
      {hasHours && (
        <View style={[styles.paymentRow, { marginTop: 8 }]}>
          <Ionicons name="sunny-outline" size={15} color={C.sub} />
          <View style={styles.paymentContent}>
            <Text style={styles.paymentLabel}>営業時間</Text>
            <Text style={styles.paymentValue}>{spot.openHours}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function PayMethodBadge({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.methodBadge}>
      <Ionicons name={icon} size={14} color={C.blue} />
      <Text style={styles.methodLabel}>{label}</Text>
    </View>
  );
}

// ─── レビューカード ────────────────────────────────────
function ReviewCard({
  review,
  onDelete,
  onPhotoTap,
}: {
  review: Review;
  onDelete: () => void;
  onPhotoTap: (uri: string) => void;
}) {
  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewCardTop}>
        <View style={styles.reviewStarRow}>
          {[1,2,3,4,5].map((s) => (
            <Ionicons
              key={s}
              name={s <= review.score ? 'star' : 'star-outline'}
              size={13}
              color={s <= review.score ? '#FFD60A' : 'rgba(255,255,255,0.2)'}
            />
          ))}
          <Text style={styles.reviewScore}>{review.score}.0</Text>
        </View>
        <View style={styles.reviewMeta}>
          <Text style={styles.reviewDate}>{formatDate(review.createdAt)}</Text>
          <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={14} color="rgba(255,255,255,0.25)" />
          </TouchableOpacity>
        </View>
      </View>

      {review.comment && (
        <Text style={styles.reviewComment}>{review.comment}</Text>
      )}

      {review.photoUri && (
        <TouchableOpacity onPress={() => onPhotoTap(review.photoUri!)} activeOpacity={0.85} style={{ marginTop: 8 }}>
          <Image source={{ uri: review.photoUri }} style={styles.reviewPhoto} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── レビュー投稿フォーム ──────────────────────────────
function ReviewForm({
  score,
  comment,
  photo,
  submitting,
  uploadProgress,
  onScoreChange,
  onCommentChange,
  onPickPhoto,
  onRemovePhoto,
  onSubmit,
  onCancel,
}: {
  score: number;
  comment: string;
  photo: string | null;
  submitting: boolean;
  uploadProgress: number;
  onScoreChange: (n: number) => void;
  onCommentChange: (s: string) => void;
  onPickPhoto: () => void;
  onRemovePhoto: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.reviewForm}>
      <Text style={styles.formTitle}>口コミを投稿</Text>

      {/* 星評価 */}
      <View style={styles.formStarRow}>
        {[1,2,3,4,5].map((s) => (
          <TouchableOpacity key={s} onPress={() => onScoreChange(s)} activeOpacity={0.7}>
            <Ionicons
              name={s <= score ? 'star' : 'star-outline'}
              size={34}
              color={s <= score ? '#FFD60A' : 'rgba(255,255,255,0.2)'}
              style={{ marginHorizontal: 4 }}
            />
          </TouchableOpacity>
        ))}
      </View>

      {/* コメント（任意） */}
      <TextInput
        style={styles.formInput}
        placeholder="コメントを追加（任意）"
        placeholderTextColor="rgba(255,255,255,0.25)"
        value={comment}
        onChangeText={onCommentChange}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />

      {/* 写真（任意） */}
      {photo ? (
        <View style={styles.formPhotoPreview}>
          <Image source={{ uri: photo }} style={styles.formPhotoThumb} />
          <TouchableOpacity style={styles.formPhotoRemove} onPress={onRemovePhoto}>
            <Ionicons name="close-circle" size={22} color={C.red} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.formPhotoBtn} onPress={onPickPhoto}>
          <Ionicons name="camera-outline" size={18} color={C.blue} />
          <Text style={styles.formPhotoBtnText}>写真を追加（任意）</Text>
        </TouchableOpacity>
      )}

      {/* アップロードプログレス */}
      {submitting && photo && uploadProgress < 1 && (
        <View style={styles.uploadProgressContainer}>
          <View style={[styles.uploadProgressBar, { width: `${Math.round(uploadProgress * 100)}%` }]} />
          <Text style={styles.uploadProgressText}>写真アップロード中… {Math.round(uploadProgress * 100)}%</Text>
        </View>
      )}

      {/* ボタン群 */}
      <View style={styles.formActions}>
        <TouchableOpacity style={styles.formCancelBtn} onPress={onCancel}>
          <Text style={styles.formCancelText}>キャンセル</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.formSubmitBtn, score === 0 && { opacity: 0.4 }]}
          onPress={onSubmit}
          disabled={submitting || score === 0}
        >
          {submitting
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.formSubmitText}>投稿する</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── スタイル ──────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    backgroundColor: C.sheet,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_H * 0.88,
    overflow: 'hidden',
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingTop: 12,
  },
  handleArea: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  handle: {
    width: 36, height: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 2,
  },

  // Header
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  closeBtn: { padding: 2, marginTop: -1 },
  spotName: { color: C.text, fontSize: FontSize.lg, fontWeight: '700', flex: 1, lineHeight: 26 },
  favBtn:   { padding: 6, marginTop: -2 },

  // Summary
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingVertical: 4,
  },
  summaryStars:  { flexDirection: 'row', gap: 1 },
  summaryAvg:    { color: C.text,  fontSize: 14, fontWeight: '700', marginLeft: 2 },
  summaryCount:  { color: C.sub,   fontSize: 13 },
  summaryEmpty:  { color: C.blue,  fontSize: 13 },

  // Badges
  badgeRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  badge:        { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeMuted:   { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  badgeText:    { color: '#fff', fontSize: 12, fontWeight: '600' },
  badgeTextMuted: { color: C.sub, fontSize: 12 },

  // Meta
  metaRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10 },
  metaText: { color: C.sub, fontSize: 13, flex: 1 },

  // Payment
  paymentCard: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: Spacing.md,
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    gap: 4,
  },
  paymentRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  paymentContent:{ flex: 1 },
  paymentLabel:  { color: C.sub,  fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  paymentValue:  { color: C.text, fontSize: 14, fontWeight: '600', marginTop: 2 },
  paymentText:   { color: C.text, fontSize: 13, marginLeft: 6 },
  paymentMethodIcons: { flexDirection: 'row', gap: 6, marginTop: 4 },
  methodBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(10,132,255,0.1)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  methodLabel:   { color: C.blue, fontSize: 11, fontWeight: '500' },

  // Gallery
  gallerySection: { marginTop: 12 },
  galleryList:   { gap: 8, paddingRight: 4 },
  galleryThumb:  { width: 130, height: 96, borderRadius: 12, backgroundColor: C.card },
  noPhotoHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingVertical: 8,
  },
  noPhotoText: { color: C.sub, fontSize: 12 },

  // Nav button
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  navBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.blue,
    borderRadius: 14,
    paddingVertical: 14,
  },
  navBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '600' },
  shareBtn: {
    width: 50,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(10,132,255,0.12)',
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(10,132,255,0.3)',
  },

  // Status report
  statusSection: { marginTop: 14, gap: 8 },
  statusLabel: { color: C.sub, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusGood: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(48,209,88,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(48,209,88,0.4)',
    borderRadius: 12,
    paddingVertical: 12,
  },
  statusFull: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,159,10,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,159,10,0.4)',
    borderRadius: 12,
    paddingVertical: 12,
  },
  statusClosed: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,69,58,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,69,58,0.4)',
    borderRadius: 12,
    paddingVertical: 12,
  },
  statusBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  statusCountBadge: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
  },
  statusReportedSection: { gap: 10, marginTop: 12 },
  timerSection: {
    backgroundColor: 'rgba(10,132,255,0.06)',
    borderRadius: 12, padding: 12, gap: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(10,132,255,0.2)',
  },
  timerLabel: { color: C.text, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  timerRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  timerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(10,132,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(10,132,255,0.3)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
  },
  timerBtnText: { color: C.blue, fontSize: 13, fontWeight: '700' },
  timerSkip: { paddingHorizontal: 10, paddingVertical: 9 },
  timerSkipText: { color: C.sub, fontSize: 13 },
  statusReported: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
  },
  statusReportedText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Reviews section
  reviewsSection: { marginTop: 24 },
  reviewsHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionLabel:   { color: C.text, fontSize: 15, fontWeight: '700' },
  sortRow:        { flexDirection: 'row', gap: 4 },
  sortBtn:        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' },
  sortBtnActive:  { backgroundColor: 'rgba(10,132,255,0.18)' },
  sortBtnText:    { color: C.sub,  fontSize: 12, fontWeight: '500' },
  sortBtnTextActive: { color: C.blue, fontWeight: '600' },

  emptyReviews: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyText:    { color: C.sub, fontSize: 14 },

  // Review card
  reviewCard: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  reviewCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewStarRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  reviewScore:   { color: C.text, fontSize: 12, fontWeight: '700', marginLeft: 4 },
  reviewMeta:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewDate:    { color: C.sub, fontSize: 11 },
  reviewComment: { color: C.text, fontSize: 14, marginTop: 8, lineHeight: 20 },
  reviewPhoto:   { width: '100%', height: 160, borderRadius: 8 },

  // Add review button
  addReviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(10,132,255,0.4)',
    marginTop: 8,
  },
  addReviewBtnText: { color: C.blue, fontSize: 14, fontWeight: '600' },

  // Review form
  reviewForm: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: Spacing.md,
    marginTop: 8,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  formTitle:    { color: C.text, fontSize: 14, fontWeight: '700' },
  formStarRow:  { flexDirection: 'row', justifyContent: 'center', marginVertical: 4 },
  formInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 12,
    color: C.text,
    fontSize: 14,
    minHeight: 80,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  formPhotoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11,
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(10,132,255,0.35)',
  },
  formPhotoBtnText: { color: C.blue, fontSize: 13, fontWeight: '500' },
  formPhotoPreview: { position: 'relative' },
  formPhotoThumb:  { width: '100%', height: 140, borderRadius: 10 },
  formPhotoRemove: { position: 'absolute', top: 6, right: 6 },
  formActions: { flexDirection: 'row', gap: 8 },
  formCancelBtn:  { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
  formCancelText: { color: C.sub, fontSize: 14, fontWeight: '500' },
  formSubmitBtn:  { flex: 2, alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: C.blue },
  formSubmitText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  uploadProgressContainer: { width: '100%', height: 24, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden', justifyContent: 'center' },
  uploadProgressBar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: C.blue, borderRadius: 6 },
  uploadProgressText: { color: C.sub, fontSize: 11, textAlign: 'center', fontWeight: '500' },

  // Fullscreen
  fullscreenBg:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  fullscreenImage: { width: '100%', height: '80%' },
  fullscreenClose: { position: 'absolute', top: 56, right: 20 },
});
