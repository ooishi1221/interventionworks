/**
 * TutorialContext — インタラクティブガイドツアーの状態管理 v2
 *
 * ワンショット構造改革対応: 探す → 案内バナー → 到着通知 → ワンショット → 新規登録 → 気配 → ライダーノート
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
  customUI?: 'presence-intro' | 'explore-banner' | 'explore-notify' | 'explore-flow' | 'newspot-explain';
}

export const STEPS: StepDef[] = [
  // ── Phase: Setup ──────────────────────────────────
  { id: 'setup', phase: 'setup', instruction: '', target: null, waitFor: 'button' },

  // ── Scene 1: バイク置き場を探す ───────────────────
  {
    id: 'scene-explore',
    phase: 'explore',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    sceneTitle: 'バイク置き場を探す',
    sceneIcon: 'compass-outline',
  },
  {
    id: 'explore-nearby',
    phase: 'explore',
    instruction: 'ここをタップすると\n現在の位置から近いバイク置き場を\n3つ探します',
    target: 'nearby-fab',
    waitFor: 'tap-target',
  },
  {
    id: 'explore-result',
    phase: 'explore',
    instruction: '今回は一番近いスポットを\n選択してみましょう',
    target: 'search-result-card',
    waitFor: 'tap-target',
  },
  {
    id: 'explore-nav',
    phase: 'explore',
    instruction: '案内開始でGoogleマップに飛べます\nタップしてみましょう',
    target: 'nav-button',
    waitFor: 'tap-target',
  },
  // ── 案内中の説明（バナー+ピンをハイライト）────
  {
    id: 'explore-banner',
    phase: 'explore',
    instruction: '案内中はヘッダーにバナーが表示され\n目的地のピンもオレンジに光ります',
    target: null,
    waitFor: 'tap-anywhere',
    customUI: 'explore-banner',
  },
  // ── 到着通知（モックカード付き）────
  {
    id: 'explore-notify',
    phase: 'explore',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    customUI: 'explore-notify',
  },
  // ── 到着フロー画像（スポット表示→ワンショット→気配更新）────
  {
    id: 'explore-flow',
    phase: 'explore',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    customUI: 'explore-flow',
  },
  // ── サーチタブ説明（ターゲットなし。穴を開けると実タップが貫通して進行不能になる） ────
  {
    id: 'explore-search',
    phase: 'explore',
    instruction: 'サーチタブから\nエリア名や施設名でも検索できます',
    target: null,
    waitFor: 'tap-anywhere',
  },

  // ── Scene 2: ワンショットで足跡を刻む ─────────────
  {
    id: 'scene-oneshot',
    phase: 'arrival',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    sceneTitle: 'ワンショットで足跡を刻む',
    sceneIcon: 'camera-outline',
  },
  {
    id: 'oneshot-do',
    phase: 'arrival',
    instruction: 'ワンショットボタンをタップして\n足跡を刻みましょう',
    target: 'oneshot-button',
    waitFor: 'tap-target',
  },
  {
    id: 'oneshot-ceremony',
    phase: 'arrival',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
  },
  {
    id: 'oneshot-result',
    phase: 'arrival',
    instruction: '足跡を刻みました！\nスポットの気配と情報が更新されます\n\nフッターの 📷 からも\n近くのスポットを更新できます',
    target: null,
    waitFor: 'tap-anywhere',
  },

  // ── Scene 3: 新しいスポットの登録 ─────────────────
  {
    id: 'scene-newspot',
    phase: 'arrival',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    sceneTitle: '新しいスポットの登録',
    sceneIcon: 'add-circle-outline',
  },
  {
    id: 'newspot-explain',
    phase: 'arrival',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    customUI: 'newspot-explain',
  },
  {
    id: 'newspot-ai',
    phase: 'arrival',
    instruction: '写真に写った看板や料金表から\nAIが情報を自動更新します\n\n※ 1日1回更新',
    target: null,
    waitFor: 'tap-anywhere',
  },

  // ── Scene 4: スポットの気配 ───────────────────────
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

  // ── Phase: Complete ───────────────────────────────
  {
    id: 'complete',
    phase: 'complete',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
  },
];

// ─── ダミースポット（チュートリアル用: 東京駅八重洲口） ──
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
  updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  lastConfirmedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // live状態
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
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────
export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const targets = useRef<Record<string, TargetRect>>({});
  const [dummySpot] = useState<ParkingPin>(DUMMY_SPOT);
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
    targets.current = {};
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
  }), [active, exiting, stepIndex, currentStep, phase, dummySpot, registerTarget, getTarget, advanceTutorial, startTutorial, finishTutorial, isStep]);

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
