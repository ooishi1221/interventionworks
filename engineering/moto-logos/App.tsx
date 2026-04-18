import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Image,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDatabase } from './src/hooks/useDatabase';
import { MapScreen, MapScreenHandle } from './src/screens/MapScreen';
import { RiderScreen } from './src/screens/RiderScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { InquiryScreen } from './src/screens/InquiryScreen';
import { LegalScreen } from './src/screens/LegalScreen';
import { TutorialOverlay } from './src/components/TutorialOverlay';
import { TutorialGuide } from './src/components/TutorialGuide';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { UserProvider } from './src/contexts/UserContext';
import { TutorialProvider, useTutorial } from './src/contexts/TutorialContext';
import { initSentry, setSentryUser, sentryWrap, captureError } from './src/utils/sentry';
import { ensureAnonymousAuth } from './src/firebase/config';
import { setupNotificationHandler, registerForPushNotifications } from './src/utils/push-notifications';
import { useImpactNotification } from './src/hooks/useImpactNotification';
import { FontSize, Spacing } from './src/constants/theme';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from './src/firebase/config';
import { ParkingPin, UserCC } from './src/types';
import { getFirstVehicle, getFootprintCount } from './src/db/database';
import { LogBox } from 'react-native';
import { Text as RNText } from 'react-native';

// ── チュートリアル: ワンショットボタンのターゲット登録 ──
function OneShotTutorialTarget({ btnRef }: { btnRef: React.RefObject<View | null> }) {
  const tutorial = useTutorial();
  useEffect(() => {
    if (!tutorial.active || !btnRef.current) return;
    const timer = setTimeout(() => {
      btnRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => {
        if (w > 0) tutorial.registerTarget('camera-button', { x, y, w, h, borderRadius: 32 });
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [tutorial.active, tutorial.stepIndex]);
  return null;
}

// ── チュートリアルスキップボタン ──────────────────────
function TutorialSkipButton({ onSkip }: { onSkip: () => void }) {
  const tutorial = useTutorial();
  // セットアップ/完了画面/非アクティブ時は非表示（TutorialOverlayが管理）
  if (!tutorial.active || tutorial.phase === 'setup' || tutorial.phase === 'complete') return null;
  return (
    <TouchableOpacity
      style={{
        position: 'absolute',
        top: Platform.OS === 'ios' ? 56 : 36,
        right: 16,
        zIndex: 10000,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 7,
      }}
      onPress={() => { tutorial.finishTutorial(); onSkip(); }}
      activeOpacity={0.7}
    >
      <RNText style={{ color: '#8E8E93', fontSize: 13, fontWeight: '600' }}>スキップ</RNText>
    </TouchableOpacity>
  );
}

// アプリ起動時に Sentry を初期化（最速で呼ぶ）
initSentry();

// プッシュ通知のフォアグラウンド表示設定（アプリ起動時に1回）
setupNotificationHandler();

// エミュレータでは Push 通知が動作しないため開発時の警告を非表示にする
if (__DEV__) {
  LogBox.ignoreLogs(['expo-notifications']);
}

const TUTORIAL_KEY = 'moto_logos_tutorial_done';
const LEGAL_CONSENT_KEY = 'moto_logos_legal_consent';

// iOS dark mode system colors
const SYS_BLUE    = '#0A84FF';
const SYS_GRAY    = '#636366';
const TAB_BG      = '#1C1C1E';
const TAB_BORDER  = 'rgba(255,255,255,0.12)';

type Tab = 'map' | 'search' | 'rider' | 'settings';
type SearchPhase = 'idle' | 'nearby' | 'text';

const ACCENT_ORANGE = '#FF6B00';

function App() {
  const { status, error } = useDatabase();
  const [tab, setTab]               = useState<Tab>('map');
  const [userCC, setUserCC]         = useState<UserCC>(125); // デフォルト: 原付二種
  const [focusSpot, setFocusSpot]   = useState<ParkingPin | null>(null);
  const [focusReviewId, setFocusReviewId] = useState<string | undefined>(undefined);
  const [mapRefreshTrigger, setMapRefreshTrigger] = useState(0);
  const [riderSub, setRiderSub] = useState<'main' | 'inquiry' | 'legal'>('main');
  const [settingsSub, setSettingsSub] = useState<'main' | 'notifications' | 'inquiry' | 'legal'>('main');
  const [searchPhase, setSearchPhase] = useState<SearchPhase>('idle');
  const [unreadCount, setUnreadCount] = useState(0);
  const [footprintCount, setFootprintCount] = useState(0);
  const [bikePhotoUrl, setBikePhotoUrl] = useState<string | null>(null);
  const mapScreenRef = useRef<MapScreenHandle>(null);
  const oneShotBtnRef = useRef<View>(null);
  const [authReady, setAuthReady] = useState(false);

  // ── 匿名認証（Firestoreアクセスに必須）─────────────
  useEffect(() => {
    ensureAnonymousAuth()
      .then(() => setAuthReady(true))
      .catch((e) => { captureError(e, { context: 'anonymous_auth' }); setAuthReady(true); }); // 失敗してもアプリは起動させる
  }, []);

  // ── ニックネーム ────────────────────────────────────
  const [nickname, setNickname] = useState<string>('');
  useEffect(() => {
    AsyncStorage.getItem('moto_logos_nickname').then((v) => {
      if (v) {
        setNickname(v);
        setSentryUser(v);
      }
    });
  }, []);
  const saveNickname = useCallback((name: string) => {
    setNickname(name);
    setSentryUser(name);
    AsyncStorage.setItem('moto_logos_nickname', name);
  }, []);

  // ── 保存済みバイクからCC読み込み + フィルタ状態復元 ──
  useEffect(() => {
    if (status !== 'ready') return;
    getFirstVehicle().then((v) => {
      if (v?.cc !== undefined) setUserCC(v.cc);
      setBikePhotoUrl(v?.photoUrl ?? null);
    }).catch(() => {});
  }, [status]);

  // ── 足跡カウント ──────────────────────────────────────
  useEffect(() => {
    if (status !== 'ready') return;
    getFootprintCount().then(setFootprintCount).catch(() => {});
  }, [status, mapRefreshTrigger]);

  // ── 未読お知らせチェック ────────────────────────────────
  const checkUnread = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(50)));
      const allIds = snap.docs.map(d => d.id);
      const raw = await AsyncStorage.getItem('moto_logos_read_announcements');
      const readIds = raw ? new Set(JSON.parse(raw)) : new Set();
      setUnreadCount(allIds.filter(id => !readIds.has(id)).length);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    checkUnread();
  }, [status, checkUnread]);

  // ── 利用規約同意 ───────────────────────────────────
  const [legalConsented, setLegalConsented] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(LEGAL_CONSENT_KEY).then((v) => {
      setLegalConsented(v === 'true');
    });
  }, []);

  const handleLegalAccept = useCallback(() => {
    setLegalConsented(true);
    AsyncStorage.setItem(LEGAL_CONSENT_KEY, 'true');
    // 利用規約同意後にプッシュ通知のパーミッション要求 & トークン登録
    registerForPushNotifications();
  }, []);

  // ── チュートリアル ─────────────────────────────────
  const [tutorialVisible, setTutorialVisible] = useState(false);
  // DB初期化完了後にチュートリアルフラグをチェック & プッシュ通知トークン更新
  useEffect(() => {
    if (status !== 'ready' || !legalConsented) return;
    AsyncStorage.getItem(TUTORIAL_KEY).then((v) => {
      if (v !== 'true') setTutorialVisible(true);
    });
    // 既に同意済みの復帰ユーザーのトークンを更新
    registerForPushNotifications();
  }, [status, legalConsented]);

  const finishTutorial = useCallback(() => {
    setTutorialVisible(false);
    AsyncStorage.setItem(TUTORIAL_KEY, 'true');
  }, []);

  const startTutorial = useCallback(() => {
    setTab('map');
    setTutorialVisible(true);
  }, []);

  // ── デジタルヤエー: 足跡の影響通知 (#104) ────────────
  useImpactNotification();

  /** タブ押下ハンドラ */
  const handleTabPress = (id: Tab) => {
    if (id === 'search') {
      // サーチタブの2段階動作
      if (tab !== 'map' && tab !== 'search') {
        // 他画面からサーチ → まずマップに切り替えて周辺検索
        setTab('map');
        setSearchPhase('nearby');
        setTimeout(() => mapScreenRef.current?.searchNearby(), 100);
      } else if (searchPhase === 'idle') {
        setTab('map');
        setSearchPhase('nearby');
        mapScreenRef.current?.searchNearby();
      } else if (searchPhase === 'nearby') {
        setSearchPhase('text');
        mapScreenRef.current?.openTextSearch();
      }
      return;
    }

    // サーチ以外のタブに切り替えたらサーチ状態リセット
    if (id !== 'map') setSearchPhase('idle');

    if (id === tab) {
      if (id === 'map') {
        mapScreenRef.current?.resetView();
        setSearchPhase('idle');
      } else if (id === 'rider') {
        setTab('map');
      } else if (id === 'settings') {
        setSettingsSub('main');
      }
    } else {
      if (id === 'rider') setRiderSub('main');
      if (id === 'settings') setSettingsSub('main');
      setTab(id);
    }
  };

  if (status === 'loading' || !authReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={SYS_BLUE} />
        <Text style={styles.loadingText}>起動中...</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>起動エラー</Text>
        <Text style={styles.errorDetail}>{error?.message}</Text>
      </View>
    );
  }

  const handleGoToSpot = (spot: ParkingPin, reviewId?: string) => {
    setFocusReviewId(reviewId);
    setFocusSpot(spot);
    setTab('map');
  };

  // ── 利用規約未同意 → 同意画面を表示 ──
  if (legalConsented === null) {
    // 読み込み中
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={SYS_BLUE} />
      </View>
    );
  }
  if (!legalConsented) {
    return (
      <ErrorBoundary>
        <LegalScreen mode="consent" onAccept={handleLegalAccept} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <UserProvider nickname={nickname}>
        <GestureHandlerRootView style={styles.root}>
        <TutorialProvider>
          <StatusBar style="light" />

          <View style={styles.content}>
            {/* MapScreen は常にマウント（タブ切替で位置を保持するため） */}
            <View style={[StyleSheet.absoluteFillObject, tab !== 'map' && { opacity: 0 }]} pointerEvents={tab === 'map' ? 'auto' : 'none'}>
              <MapScreen
                ref={mapScreenRef}
                userCC={userCC}
                onChangeCC={(cc) => setUserCC(cc)}
                focusSpot={focusSpot}
                focusReviewId={focusReviewId}
                onFocusConsumed={() => { setFocusSpot(null); setFocusReviewId(undefined); }}
                refreshTrigger={mapRefreshTrigger}
                searchPhase={searchPhase}
                onSearchPhaseChange={setSearchPhase}
              />
            </View>
            {tab === 'rider' && (
              riderSub === 'inquiry' ? (
                <InquiryScreen onBack={() => setRiderSub('main')} />
              ) : riderSub === 'legal' ? (
                <LegalScreen mode="view" onBack={() => setRiderSub('main')} />
              ) : (
                <RiderScreen
                  onGoToSpot={handleGoToSpot}
                  onDataChanged={() => { setMapRefreshTrigger((n) => n + 1); getFootprintCount().then(setFootprintCount).catch(() => {}); getFirstVehicle().then((v) => setBikePhotoUrl(v?.photoUrl ?? null)).catch(() => {}); }}
                  userCC={userCC}
                  onChangeCC={(cc) => setUserCC(cc)}
                  nickname={nickname}
                  onChangeNickname={saveNickname}
                />
              )
            )}
            {tab === 'settings' && (
              settingsSub === 'notifications' ? (
                <NotificationsScreen onBack={() => { setSettingsSub('main'); checkUnread(); }} />
              ) : settingsSub === 'inquiry' ? (
                <InquiryScreen onBack={() => setSettingsSub('main')} />
              ) : settingsSub === 'legal' ? (
                <LegalScreen mode="view" onBack={() => setSettingsSub('main')} />
              ) : (
                <SettingsScreen
                  onOpenLegal={() => setSettingsSub('legal')}
                  onOpenInquiry={() => setSettingsSub('inquiry')}
                  onOpenNotifications={() => setSettingsSub('notifications')}
                  onStartTutorial={startTutorial}
                  onBack={() => setTab('map')}
                  unreadCount={unreadCount}
                />
              )
            )}
          </View>

          <SafeAreaView style={styles.tabBarWrapper}>
            <View style={styles.tabBar}>
              {/* 🏠 マップ */}
              <TouchableOpacity
                style={styles.tabItem}
                onPress={() => handleTabPress('map')}
                activeOpacity={0.6}
              >
                <Ionicons
                  name={tab === 'map' ? 'home' : 'home-outline'}
                  size={32}
                  color={tab === 'map' ? SYS_BLUE : SYS_GRAY}
                />
              </TouchableOpacity>

              {/* 🔍 サーチ */}
              <TouchableOpacity
                style={styles.tabItem}
                onPress={() => handleTabPress('search')}
                activeOpacity={0.6}
              >
                <Ionicons
                  name={searchPhase !== 'idle' ? 'search' : 'search-outline'}
                  size={32}
                  color={searchPhase !== 'idle' ? SYS_BLUE : SYS_GRAY}
                />
              </TouchableOpacity>

              {/* 📸 ワンショット（中央突き出し） */}
              <View style={styles.oneShotWrapper}>
                <TouchableOpacity
                  ref={oneShotBtnRef}
                  style={styles.oneShotBtn}
                  onPress={() => {
                    if (tab !== 'map') setTab('map');
                    mapScreenRef.current?.triggerOneShot();
                  }}
                  activeOpacity={0.8}
                  accessibilityLabel="ワンショットで足跡を刻む"
                  accessibilityRole="button"
                >
                  <Ionicons name="camera" size={32} color="#FFF" />
                </TouchableOpacity>
              </View>

              {/* 👤 ライダー（丸アバター） */}
              <TouchableOpacity
                style={styles.tabItem}
                onPress={() => handleTabPress('rider')}
                activeOpacity={0.6}
              >
                {bikePhotoUrl ? (
                  <View style={[styles.avatarRing, tab === 'rider' && styles.avatarRingActive]}>
                    <Image source={{ uri: bikePhotoUrl }} style={styles.avatarImg} />
                  </View>
                ) : (
                  <Ionicons
                    name={tab === 'rider' ? 'person' : 'person-outline'}
                    size={32}
                    color={tab === 'rider' ? SYS_BLUE : SYS_GRAY}
                  />
                )}
              </TouchableOpacity>

              {/* ⚙️ 設定 */}
              <TouchableOpacity
                style={styles.tabItem}
                onPress={() => handleTabPress('settings')}
                activeOpacity={0.6}
              >
                <View>
                  <Ionicons
                    name={tab === 'settings' ? 'settings' : 'settings-outline'}
                    size={32}
                    color={tab === 'settings' ? SYS_BLUE : SYS_GRAY}
                  />
                  {unreadCount > 0 && <View style={styles.unreadDot} />}
                </View>
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          {/* ガイドツアー: スポットライト + 指示テキスト + スキップ */}
          <TutorialGuide />
          <TutorialSkipButton onSkip={finishTutorial} />
          <OneShotTutorialTarget btnRef={oneShotBtnRef} />

          {/* チュートリアルオーバーレイ（セットアップ + 完了画面） */}
          <TutorialOverlay
            visible={tutorialVisible}
            onFinish={finishTutorial}
            userCC={userCC}
            onChangeCC={(cc) => setUserCC(cc)}

          />
        </TutorialProvider>
        </GestureHandlerRootView>
      </UserProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  content: { flex: 1 },
  center: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText:  { color: SYS_GRAY,   fontSize: FontSize.md },
  errorText:    { color: '#FF453A',  fontSize: FontSize.lg, fontWeight: '700' },
  errorDetail:  { color: SYS_GRAY,   fontSize: FontSize.sm, paddingHorizontal: Spacing.lg, textAlign: 'center' },
  tabBarWrapper: {
    backgroundColor: TAB_BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: TAB_BORDER,
  },
  tabBar: { flexDirection: 'row', height: Platform.OS === 'android' ? 68 : 64, alignItems: 'flex-end', justifyContent: 'space-around' },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: Platform.OS === 'android' ? 68 : 64,
  },
  avatarRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRingActive: {
    borderColor: SYS_BLUE,
  },
  avatarImg: {
    width: 31,
    height: 31,
    borderRadius: 15.5,
  },
  unreadDot: {
    position: 'absolute' as const,
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF453A',
  },
  // ── ワンショットボタン（中央突き出し） ────────────────
  oneShotWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: Platform.OS === 'android' ? 68 : 64,
  },
  oneShotBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: ACCENT_ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Platform.OS === 'android' ? -4 : -6,
    shadowColor: ACCENT_ORANGE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});

// Sentry.wrap でルートコンポーネントをラップし、
// 未捕捉のネイティブクラッシュ・JS例外を自動レポートする
export default sentryWrap(App);
