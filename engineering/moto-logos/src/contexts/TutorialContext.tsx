/**
 * TutorialContext — インタラクティブガイドツアーの状態管理
 *
 * ソシャゲ式: 実際にUIをタップさせて覚えさせる。
 * 各コンポーネントは tutorialStep を見て、自分がハイライト対象か判断し、
 * ユーザーの操作完了を advanceTutorial() で報告する。
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ParkingPin } from '../types';

// ─── ステップ定義 ──────────────────────────────────────
export type TutorialPhase = 'setup' | 'explore' | 'report' | 'register' | 'complete' | 'inactive';

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
}

export const STEPS: StepDef[] = [
  // ── Phase: Setup ──────────────────────────────────
  { id: 'setup', phase: 'setup', instruction: '', target: null, waitFor: 'button' },

  // ── Scene: 探す ───────────────────────────────────
  {
    id: 'scene-explore',
    phase: 'explore',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    sceneTitle: 'バイク置き場を探す',
    sceneIcon: 'compass-outline',
  },

  // ── Phase: Explore（探す） ────────────────────────
  {
    id: 'explore-pillbar',
    phase: 'explore',
    instruction: 'ここに最寄りのスポットが表示されます\n1番をタップしてみましょう',
    target: 'pillbar',
    waitFor: 'tap-target',
  },
  {
    id: 'explore-detail-badges',
    phase: 'explore',
    instruction: '排気量・有料無料・台数などが\n確認できます',
    target: 'detail-badges',
    waitFor: 'tap-anywhere',
  },
  {
    id: 'explore-detail-freshness',
    phase: 'explore',
    instruction: 'ライダーが報告をすると\n情報の鮮度が上がります',
    target: 'detail-freshness',
    waitFor: 'tap-anywhere',
  },
  {
    id: 'explore-detail-reviews',
    phase: 'explore',
    instruction: 'みんなの口コミも見られます',
    target: 'detail-reviews',
    waitFor: 'tap-anywhere',
  },
  {
    id: 'explore-nav',
    phase: 'explore',
    instruction: '案内開始でナビアプリに飛べます\nタップしてみましょう',
    target: 'nav-button',
    waitFor: 'tap-target',
  },
  {
    id: 'explore-close-sheet',
    phase: 'explore',
    instruction: '',
    target: null,
    waitFor: 'auto',
    autoDelay: 800,
  },
  {
    id: 'explore-search',
    phase: 'explore',
    instruction: '場所で検索もできます\n🔍をタップしてみましょう',
    target: 'search-button',
    waitFor: 'tap-target',
  },
  {
    id: 'explore-search-show',
    phase: 'explore',
    instruction: '場所名を入力して検索できます',
    target: null,
    waitFor: 'tap-anywhere',
  },
  {
    id: 'explore-search-result',
    phase: 'explore',
    instruction: 'このように検索して\n詳細情報を確認できます',
    target: null,
    waitFor: 'tap-anywhere',
  },
  {
    id: 'explore-search-done',
    phase: 'explore',
    instruction: '',
    target: null,
    waitFor: 'auto',
    autoDelay: 500,
  },

  // ── Scene: 報告する ───────────────────────────────
  {
    id: 'scene-report',
    phase: 'report',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    sceneTitle: 'バイクを降りたら',
    sceneIcon: 'flag-outline',
  },

  // ── Phase: Report（報告する） ─────────────────────
  {
    id: 'report-intro',
    phase: 'report',
    instruction: 'バイクを停めたらアプリを開きましょう\n近くのスポットが自動で表示されます',
    target: 'proximity-card',
    waitFor: 'tap-anywhere',
  },
  {
    id: 'report-good',
    phase: 'report',
    instruction: '停められた👍をタップしてみましょう',
    target: 'report-good-btn',
    waitFor: 'tap-target',
  },
  {
    id: 'report-good-thanks',
    phase: 'report',
    instruction: '',
    target: null,
    waitFor: 'tap-target',
  },
  {
    id: 'report-good-done',
    phase: 'report',
    instruction: '簡単ですよね',
    target: null,
    waitFor: 'tap-anywhere',
  },
  {
    id: 'report-bad-intro',
    phase: 'report',
    instruction: 'ダメだった場合は👎をタップします',
    target: 'report-bad-btn',
    waitFor: 'tap-target',
  },
  {
    id: 'report-bad-reason',
    phase: 'report',
    instruction: '理由を選んでみましょう',
    target: null,
    waitFor: 'tap-target',
  },
  {
    id: 'report-bad-done',
    phase: 'report',
    instruction: 'このようにライダー全員に通知されます\n次のライダーが助かります！',
    target: 'feed-notification',
    waitFor: 'tap-anywhere',
  },

  // ── Scene: 新規登録 ───────────────────────────────
  {
    id: 'scene-register',
    phase: 'register',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    sceneTitle: '新しい場所を見つけたら',
    sceneIcon: 'camera-outline',
  },

  // ── Phase: Register（新規登録） ───────────────────
  {
    id: 'register-camera',
    phase: 'register',
    instruction: '📸をタップで登録できます',
    target: 'camera-button',
    waitFor: 'tap-target',
  },
  {
    id: 'register-done',
    phase: 'register',
    instruction: '写真を撮るだけで登録完了です！\nとても簡単ですよね',
    target: null,
    waitFor: 'tap-anywhere',
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
  updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2日前更新（青バッジ）
};

/** ユーザーの現在地付近にダミースポットを配置（近接カード用） */
export function createNearbyDummySpot(userLat: number, userLon: number): ParkingPin {
  return {
    ...DUMMY_SPOT,
    latitude: userLat + 0.0002, // ~20m north（近接カードが反応する距離）
    longitude: userLon,
  };
}

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
  /** 現在のステップindex (0-based) */
  stepIndex: number;
  /** 現在のステップ定義 */
  currentStep: StepDef;
  /** 現在のフェーズ */
  phase: TutorialPhase;
  /** ダミースポット */
  dummySpot: ParkingPin;
  /** ターゲット矩形の登録（コンポーネントが自分の位置を報告） */
  registerTarget: (id: string, rect: TargetRect) => void;
  /** 登録済みターゲット矩形の取得 */
  getTarget: (id: string) => TargetRect | null;
  /** 次のステップへ進む（コンポーネントがユーザー操作完了を報告） */
  advanceTutorial: () => void;
  /** チュートリアル開始 */
  startTutorial: () => void;
  /** チュートリアル終了 */
  finishTutorial: () => void;
  /** 特定ステップかチェック */
  isStep: (id: string) => boolean;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────
export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
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
    if (advancingRef.current) return; // ダブルタップ防止
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
    setActive(false);
    setStepIndex(0);
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
  }, []);

  const isStep = useCallback((id: string) => {
    return active && currentStep.id === id;
  }, [active, currentStep.id]);


  const value = useMemo<TutorialContextValue>(() => ({
    active,
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
  }), [active, stepIndex, currentStep, phase, dummySpot, registerTarget, getTarget, advanceTutorial, startTutorial, finishTutorial, isStep]);

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
