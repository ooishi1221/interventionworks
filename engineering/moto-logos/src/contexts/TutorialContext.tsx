/**
 * TutorialContext — インタラクティブガイドツアーの状態管理 v3
 *
 * CEO仕様準拠: A排気量 → B探す → C到着 → D新規登録 → E気配 → 完了
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ParkingPin } from '../types';

// ─── ステップ定義 ──────────────────────────────────────
export type TutorialPhase = 'setup' | 'explore' | 'arrival' | 'presence' | 'complete' | 'inactive';

/** waitFor: ユーザーが何をしたら次に進むか */
type WaitFor =
  | 'button'       // 明示的なボタン押下（セットアップ画面の「はじめる」等）
  | 'tap-target'   // 指定ターゲットのタップ（コンポーネントが報告）
  | 'tap-anywhere'  // 画面どこでもタップ
  | 'auto';         // 自動遷移（delay後）

export type CustomUI =
  | 'presence-intro'
  | 'explore-banner'
  | 'explore-nav-confirm'
  | 'arrive-notify'
  | 'arrive-result'
  | 'newspot-explain';

export interface StepDef {
  id: string;
  phase: TutorialPhase;
  instruction: string;
  /** ハイライト対象のID。コンポーネントが registerTarget(id, rect) で位置を登録 */
  target: string | null;
  waitFor: WaitFor;
  /** auto の場合の遅延ms */
  autoDelay?: number;
  /** シーン切替タイトル（フェーズ間のインタースティシャル） */
  sceneTitle?: string;
  /** シーンアイコン（Ionicons名） */
  sceneIcon?: string;
  /** 特殊カスタムUI識別子（TutorialGuide が分岐に使う） */
  customUI?: CustomUI;
}

export const STEPS: StepDef[] = [
  // ── A. セットアップ（排気量選択）──────────────────
  { id: 'setup', phase: 'setup', instruction: '', target: null, waitFor: 'button' },

  // ── B. バイク置き場を探す ─────────────────────────
  {
    id: 'scene-explore',
    phase: 'explore',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    sceneTitle: 'バイク置き場を探す',
    sceneIcon: 'compass-outline',
  },
  // B-1: FABスポットライト
  {
    id: 'explore-nearby',
    phase: 'explore',
    instruction: 'タップすると\n現在の位置から近いバイク置き場を探します',
    target: 'nearby-fab',
    waitFor: 'tap-target',
  },
  // B-2: カードスポットライト
  {
    id: 'explore-result',
    phase: 'explore',
    instruction: '今回は一番近いスポットを\n選択してみましょう',
    target: 'search-result-card',
    waitFor: 'tap-target',
  },
  // B-3: 案内開始スポットライト
  {
    id: 'explore-nav',
    phase: 'explore',
    instruction: '案内開始でGoogleマップに遷移します\nタップしてみましょう',
    target: 'nav-button',
    waitFor: 'tap-target',
  },
  // B-4: 確認カード（Googleマップ / 住所をコピー）+ テキスト
  {
    id: 'explore-nav-confirm',
    phase: 'explore',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    customUI: 'explore-nav-confirm',
  },
  // B-5: 案内中バナー + ピンオレンジ
  {
    id: 'explore-banner',
    phase: 'explore',
    instruction: '案内中はヘッダーにバナーが表示されます',
    target: null,
    waitFor: 'tap-anywhere',
    customUI: 'explore-banner',
  },

  // ── C. 到着したら ─────────────────────────────────
  {
    id: 'scene-arrive',
    phase: 'arrival',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    sceneTitle: '到着したら',
    sceneIcon: 'flag-outline',
  },
  // C-1: 500m通知の説明
  {
    id: 'arrive-notify-explain',
    phase: 'arrival',
    instruction: '目的地の500m圏内に入ると\n通知が届きます',
    target: null,
    waitFor: 'tap-anywhere',
  },
  // C-2: モック通知カード（タップ可能）
  {
    id: 'arrive-notify',
    phase: 'arrival',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    customUI: 'arrive-notify',
  },
  // C-3: ワンショットボタンスポットライト
  {
    id: 'arrive-oneshot',
    phase: 'arrival',
    instruction: 'ワンショットボタンをタップして\n足跡を刻みましょう',
    target: 'oneshot-button',
    waitFor: 'tap-target',
  },
  // C-4a: セレモニー演出（TutorialGuide非表示）
  {
    id: 'arrive-ceremony',
    phase: 'arrival',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
  },
  // C-4b: スポットカード再表示 + 気配の色変更
  {
    id: 'arrive-result',
    phase: 'arrival',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    customUI: 'arrive-result',
  },
  // C-5: AI自動更新の説明
  {
    id: 'arrive-ai',
    phase: 'arrival',
    instruction: '看板などをワンショットすると\n自動で情報が更新されます',
    target: null,
    waitFor: 'tap-anywhere',
  },

  // ── D. 新しいスポットの登録 ───────────────────────
  {
    id: 'scene-newspot',
    phase: 'arrival',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    sceneTitle: '新しいスポットの登録',
    sceneIcon: 'add-circle-outline',
  },
  // D-1: ＋ボタンの説明（フッターモック付き）
  {
    id: 'newspot-explain',
    phase: 'arrival',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    customUI: 'newspot-explain',
  },
  // D-2: 実際にやってみよう
  {
    id: 'newspot-prompt',
    phase: 'arrival',
    instruction: 'ワンショットするだけで\nその場に新しいスポットが登録されます\n\n実際にやってみましょう',
    target: null,
    waitFor: 'tap-anywhere',
  },
  // D-3a: ＋ボタンスポットライト
  {
    id: 'newspot-do',
    phase: 'arrival',
    instruction: '＋ ボタンをタップ',
    target: 'camera-button',
    waitFor: 'tap-target',
  },
  // D-3b: セレモニー演出（TutorialGuide非表示）
  {
    id: 'newspot-ceremony',
    phase: 'arrival',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
  },

  // ── E. スポットの気配 ─────────────────────────────
  {
    id: 'scene-presence',
    phase: 'presence',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    sceneTitle: 'スポットの「気配」',
    sceneIcon: 'pulse-outline',
  },
  {
    id: 'presence-intro',
    phase: 'presence',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    customUI: 'presence-intro',
  },

  // ── 完了 ──────────────────────────────────────────
  {
    id: 'complete',
    phase: 'complete',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
  },
];

// ─── ダミースポット（チュートリアル用: 東京駅八重洲口） ──
// 初期状態は "cold"（半年以上前）。C-4でセレモニー後に "live" に変化させて色変更を見せる
export const DUMMY_SPOT: ParkingPin = {
  id: '_tutorial_spot_',
  name: '東京駅八重洲口バイク駐車場',
  latitude: 35.6808,
  longitude: 139.7689,
  maxCC: null,
  isFree: false,
  capacity: 30,
  source: 'seed',
  address: '東京都中央区八重洲1丁目',
  updatedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
  lastConfirmedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(), // cold状態
};

/** チュートリアル: 東京駅周辺の最寄り3件（FAB検索用） */
export const TUTORIAL_NEARBY_RESULTS: { spot: ParkingPin; distanceM: number }[] = [
  { spot: DUMMY_SPOT, distanceM: 120 },
  {
    spot: {
      id: '_tutorial_spot_2', name: '日本橋駅前バイク駐車場',
      latitude: 35.6825, longitude: 139.7740, maxCC: null,
      isFree: false, capacity: 15, source: 'seed',
      address: '東京都中央区日本橋1丁目', priceInfo: '¥100/30分',
      updatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    distanceM: 350,
  },
  {
    spot: {
      id: '_tutorial_spot_3', name: '京橋エドグラン駐輪場',
      latitude: 35.6778, longitude: 139.7710, maxCC: 125,
      isFree: true, capacity: 8, source: 'seed',
      address: '東京都中央区京橋2丁目',
      updatedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    },
    distanceM: 580,
  },
];

// ─── ターゲット矩形（スポットライト用） ──────────────────
export interface TargetRect {
  x: number;
  y: number;
  w: number;
  h: number;
  borderRadius?: number;
}

// ─── Context 型 ─────────────────────────────────────────
interface TutorialContextValue {
  /** チュートリアルが進行中か */
  active: boolean;
  /** 終了アニメーション中か */
  exiting: boolean;
  /** 現在のステップindex (0-based) */
  stepIndex: number;
  /** 現在のステップ定義 */
  currentStep: StepDef;
  /** 現在のフェーズ */
  phase: TutorialPhase;
  /** ダミースポット（探す用） */
  dummySpot: ParkingPin;
  /** ターゲット矩形の登録（コンポーネントが自分の位置を報告） */
  registerTarget: (id: string, rect: TargetRect) => void;
  /** 登録済みターゲット矩形の取得 */
  getTarget: (id: string) => TargetRect | null;
  /** 次のステップへ進む（コンポーネントがユーザー操作完了を報告） */
  advanceTutorial: () => void;
  /** チュートリアル開始 */
  startTutorial: () => void;
  /** チュートリアル終了（フェードアウト開始） */
  finishTutorial: () => void;
  /** 特定ステップかチェック */
  isStep: (id: string) => boolean;
  /** ダミースポットを "live" 状態にする（C-4 気配色変更デモ用） */
  markDummyConfirmed: () => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────
export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const targets = useRef<Record<string, TargetRect>>({});
  const [dummySpot, setDummySpot] = useState<ParkingPin>(DUMMY_SPOT);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentStep = STEPS[stepIndex] ?? STEPS[0];
  const phase = active ? currentStep.phase : 'inactive';

  // ターゲット登録
  const registerTarget = useCallback((id: string, rect: TargetRect) => {
    targets.current[id] = rect;
  }, []);

  const getTarget = useCallback((id: string): TargetRect | null => {
    return targets.current[id] ?? null;
  }, []);

  // ステップ進行（ダブルタップ防止付き）
  const advancingRef = useRef(false);
  const advanceTutorial = useCallback(() => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    setTimeout(() => { advancingRef.current = false; }, 300);

    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    setStepIndex((prev) => {
      const next = prev + 1;
      if (next >= STEPS.length) {
        setActive(false);
        return 0;
      }
      return next;
    });
  }, []);

  // auto ステップの自動遷移
  useEffect(() => {
    if (!active) return;
    const step = STEPS[stepIndex];
    if (step?.waitFor === 'auto' && step.autoDelay) {
      autoTimerRef.current = setTimeout(advanceTutorial, step.autoDelay);
      return () => {
        if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      };
    }
  }, [active, stepIndex, advanceTutorial]);

  const startTutorial = useCallback(() => {
    setStepIndex(0);
    setActive(true);
    setDummySpot(DUMMY_SPOT); // cold状態にリセット
    targets.current = {};
  }, []);

  // C-4: セレモニー後にダミースポットを "live" に変化させる
  const markDummyConfirmed = useCallback(() => {
    setDummySpot((prev) => ({
      ...prev,
      lastConfirmedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const finishTutorial = useCallback(() => {
    setExiting(true);
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    setTimeout(() => {
      setActive(false);
      setExiting(false);
      setStepIndex(0);
    }, 400);
  }, []);

  const isStep = useCallback((id: string) => {
    return active && currentStep.id === id;
  }, [active, currentStep.id]);


  const value = useMemo<TutorialContextValue>(() => ({
    active,
    exiting,
    stepIndex,
    currentStep,
    phase,
    dummySpot,
    registerTarget,
    getTarget,
    advanceTutorial,
    startTutorial,
    finishTutorial,
    isStep,
    markDummyConfirmed,
  }), [active, exiting, stepIndex, currentStep, phase, dummySpot, registerTarget, getTarget, advanceTutorial, startTutorial, finishTutorial, isStep, markDummyConfirmed]);

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────
export function useTutorial(): TutorialContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error('useTutorial must be used within TutorialProvider');
  return ctx;
}
