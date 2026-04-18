import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  Platform,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDatabase } from './src/hooks/useDatabase';
import { MapScreen, MapScreenHandle } from './src/screens/MapScreen';
import { RiderScreen } from './src/screens/RiderScreen';
import { MyBikeScreen } from './src/screens/MyBikeScreen';
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

type Tab = 'map' | 'settings';

const ACCENT_ORANGE = '#FF6B00';

function App() {
  const { status, error } = useDatabase();
  const [tab, setTab]               = useState<Tab>('map');
  const [userCC, setUserCC]         = useState<UserCC>(125); // デフォルト: 原付二種
  const [ccFilterEnabled, setCcFilterEnabled] = useState(true); // デフォルトON
  const [focusSpot, setFocusSpot]   = useState<ParkingPin | null>(null);
  const [mapRefreshTrigger, setMapRefreshTrigger] = useState(0);
  const [settingsSub, setSettingsSub] = useState<'main' | 'inquiry' | 'legal'>('main');
  const [riderSub, setRiderSub] = useState<'main' | 'mybike'>('main');
  const [showRider, setShowRider]   = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [footprintCount, setFootprintCount] = useState(0);
  const seenFootprintCount = useRef(0); // RiderScreen を開いた時点のカウント
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
    AsyncStorage.getItem('moto_logos_cc_filter').then((v) => {
      if (v !== null) setCcFilterEnabled(v !== 'false');
    });
  }, [status]);

  const toggleCcFilter = useCallback((enabled: boolean) => {
    setCcFilterEnabled(enabled);
    AsyncStorage.setItem('moto_logos_cc_filter', String(enabled));
  }, []);

  // ── 足跡カウント（アバターバッジ用） ──────────────────
  useEffect(() => {
    if (status !== 'ready') return;
    getFootprintCount().then((c) => {
      setFootprintCount(c);
      // 初回ロード時は既読扱い（起動時バッジ0）
      if (seenFootprintCount.current === 0) seenFootprintCount.current = c;
    }).catch(() => {});
  }, [status, mapRefreshTrigger]);

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

  /** タブ押下ハンドラ
   *  - マップ2度押し → 現在地リセット
   *  - 他タブ2度押し → マップに戻る
   */
  const handleTabPress = (id: Tab) => {
    if (showRider) setShowRider(false);
    if (showNotifications) setShowNotifications(false);
    if (id === tab) {
      if (id === 'map') {
        mapScreenRef.current?.resetView();
      } else {
        setTab('map');
      }
    } else {
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

  const handleGoToSpot = (spot: ParkingPin) => {
    setFocusSpot(spot);
    setShowRider(false);
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
            <View style={[StyleSheet.absoluteFillObject, tab !== 'map' && { opacity: 0 }]} pointerEvents={tab === 'map' && !showRider ? 'auto' : 'none'}>
              <MapScreen
                ref={mapScreenRef}
                userCC={userCC}
                onChangeCC={(cc) => setUserCC(cc)}
                ccFilterEnabled={ccFilterEnabled}
                onToggleCcFilter={toggleCcFilter}
                focusSpot={focusSpot}
                onFocusConsumed={() => setFocusSpot(null)}
                refreshTrigger={mapRefreshTrigger}
                onGoToSettings={() => setTab('settings')}
                onAvatarPress={() => { setShowRider((v) => { if (!v) { setRiderSub('main'); seenFootprintCount.current = footprintCount; } return !v; }); }}
                footprintCount={footprintCount - seenFootprintCount.current}
                onNotificationsPress={() => setShowNotifications((v) => !v)}
                bikePhotoUrl={bikePhotoUrl}
              />
            </View>
            {showRider && (
              riderSub === 'mybike' ? (
                <MyBikeScreen
                  userCC={userCC}
                  onChangeCC={(cc) => setUserCC(cc)}
                  onBack={() => { setRiderSub('main'); getFirstVehicle().then((v) => setBikePhotoUrl(v?.photoUrl ?? null)).catch(() => {}); }}
                />
              ) : (
                <RiderScreen
                  onGoToSpot={handleGoToSpot}
                  onDataChanged={() => { setMapRefreshTrigger((n) => n + 1); getFootprintCount().then(setFootprintCount).catch(() => {}); }}
                  onOpenMyBike={() => setRiderSub('mybike')}
                  nickname={nickname}
                  onChangeNickname={saveNickname}
                  onBack={() => setShowRider(false)}
                />
              )
            )}
            {showNotifications && (
              <NotificationsScreen onBack={() => setShowNotifications(false)} />
            )}
            {tab === 'settings' && (
              settingsSub === 'inquiry' ? (
                <InquiryScreen onBack={() => setSettingsSub('main')} />
              ) : settingsSub === 'legal' ? (
                <LegalScreen mode="view" onBack={() => setSettingsSub('main')} />
              ) : (
                <SettingsScreen
                  onOpenLegal={() => setSettingsSub('legal')}
                  onOpenInquiry={() => setSettingsSub('inquiry')}
                  onStartTutorial={startTutorial}
                />
              )
            )}
          </View>

          <SafeAreaView style={styles.tabBarWrapper}>
            <View style={styles.tabBar}>
              {/* マップタブ（左） */}
              <TouchableOpacity
                style={styles.tabItem}
                onPress={() => handleTabPress('map')}
                activeOpacity={0.6}
              >
                <Ionicons
                  name={tab === 'map' && !showRider && !showNotifications ? 'map' : 'map-outline'}
                  size={24}
                  color={tab === 'map' && !showRider && !showNotifications ? SYS_BLUE : SYS_GRAY}
                />
                <Text style={[styles.tabLabel, tab === 'map' && !showRider && !showNotifications && styles.tabLabelActive]}>
                  マップ
                </Text>
              </TouchableOpacity>

              {/* ── ワンショットボタン（中央突き出し） ─── */}
              <View style={styles.oneShotWrapper}>
                <TouchableOpacity
                  ref={oneShotBtnRef}
                  style={styles.oneShotBtn}
                  onPress={() => {
                    mapScreenRef.current?.triggerOneShot();
                  }}
                  activeOpacity={0.8}
                  accessibilityLabel="ワンショットで足跡を刻む"
                  accessibilityRole="button"
                >
                  <Ionicons name="camera" size={28} color="#FFF" />
                </TouchableOpacity>
              </View>

              {/* 設定タブ（右） */}
              <TouchableOpacity
                style={styles.tabItem}
                onPress={() => handleTabPress('settings')}
                activeOpacity={0.6}
              >
                <Ionicons
                  name={tab === 'settings' ? 'settings' : 'settings-outline'}
                  size={24}
                  color={tab === 'settings' ? SYS_BLUE : SYS_GRAY}
                />
                <Text style={[styles.tabLabel, tab === 'settings' && styles.tabLabelActive]}>
                  設定
                </Text>
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
  tabBar: { flexDirection: 'row', height: Platform.OS === 'android' ? 56 : 52, alignItems: 'flex-end', justifyContent: 'space-around' },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: Platform.OS === 'android' ? 56 : 52,
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    color: SYS_GRAY,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    color: SYS_BLUE,
    fontWeight: '600',
  },
  // ── ワンショットボタン（中央突き出し） ────────────────
  oneShotWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: Platform.OS === 'android' ? 56 : 52,
  },
  oneShotBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
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
