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
import { FontSize, Spacing } from './src/constants/theme';
import { ParkingPin, UserCC } from './src/types';
import { LogBox } from 'react-native';
import { Text as RNText } from 'react-native';

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

type Tab = 'map' | 'rider' | 'notifications' | 'settings';

type TabDef = {
  id: Tab; label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
};

const TABS: TabDef[] = [
  { id: 'map',           label: 'マップ',    icon: 'map-outline',           iconActive: 'map'           },
  { id: 'rider',         label: 'ライダー',  icon: 'person-outline',        iconActive: 'person'        },
  { id: 'notifications', label: 'お知らせ',  icon: 'notifications-outline', iconActive: 'notifications' },
  { id: 'settings',      label: '設定',      icon: 'settings-outline',      iconActive: 'settings'      },
];

function App() {
  const { status, error } = useDatabase();
  const [tab, setTab]               = useState<Tab>('map');
  const [userCC, setUserCC]         = useState<UserCC>(125); // デフォルト: 原付二種
  const [focusSpot, setFocusSpot]   = useState<ParkingPin | null>(null);
  const [mapRefreshTrigger, setMapRefreshTrigger] = useState(0);
  const [settingsSub, setSettingsSub] = useState<'main' | 'inquiry' | 'legal'>('main');
  const [riderSub, setRiderSub] = useState<'main' | 'mybike'>('main');
  const mapScreenRef = useRef<MapScreenHandle>(null);
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


  /** タブ押下ハンドラ
   *  - マップ2度押し → 現在地リセット
   *  - 他タブ2度押し → マップに戻る
   */
  const handleTabPress = (id: Tab) => {
    if (id === tab) {
      // 同じタブを2度押し
      if (id === 'map') {
        mapScreenRef.current?.resetView();
      } else {
        // ライダー/お知らせ/設定 → マップに戻る
        setTab('map');
      }
    } else {
      if (id !== 'settings') setSettingsSub('main');
      if (id !== 'rider') setRiderSub('main');
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
                onFocusConsumed={() => setFocusSpot(null)}
                refreshTrigger={mapRefreshTrigger}

              />
            </View>
            {tab === 'rider' && (
              riderSub === 'mybike' ? (
                <MyBikeScreen
                  userCC={userCC}
                  onChangeCC={(cc) => setUserCC(cc)}
                  onBack={() => setRiderSub('main')}
                />
              ) : (
                <RiderScreen
                  onGoToSpot={handleGoToSpot}
                  onDataChanged={() => setMapRefreshTrigger((n) => n + 1)}
                  onOpenMyBike={() => setRiderSub('mybike')}
                  nickname={nickname}
                  onChangeNickname={saveNickname}
                />
              )
            )}
            {tab === 'notifications' && (
              <NotificationsScreen />
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
              {TABS.map((t) => {
                const isActive = tab === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={styles.tabItem}
                    onPress={() => handleTabPress(t.id)}
                    activeOpacity={0.6}
                  >
                    <Ionicons
                      name={isActive ? t.iconActive : t.icon}
                      size={24}
                      color={isActive ? SYS_BLUE : SYS_GRAY}
                    />
                    <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </SafeAreaView>

          {/* ガイドツアー: スポットライト + 指示テキスト + スキップ */}
          <TutorialGuide />
          <TutorialSkipButton onSkip={finishTutorial} />

          {/* チュートリアルオーバーレイ（セットアップ + 完了画面） */}
          <TutorialOverlay
            visible={tutorialVisible}
            onFinish={finishTutorial}
            userCC={userCC}
            onChangeCC={(cc) => setUserCC(cc)}
            onSetNickname={saveNickname}
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
  tabBar: { flexDirection: 'row', height: Platform.OS === 'android' ? 56 : 52 },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
});

// Sentry.wrap でルートコンポーネントをラップし、
// 未捕捉のネイティブクラッシュ・JS例外を自動レポートする
export default sentryWrap(App);
