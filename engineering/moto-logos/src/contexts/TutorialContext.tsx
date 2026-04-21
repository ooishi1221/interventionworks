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
export type TutorialPhase = 'setup' | 'explore' | 'presence' | 'complete' | 'inactive';

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
  /** 特殊カスタムUI識別子（TutorialOverlay/Guide が分岐に使う） */
  customUI?: 'presence-intro';
}

export const STEPS: StepDef[] = [
  // ── Phase: Setup ──────────────────────────────────
  { id: 'setup', phase: 'setup', instruction: '', target: null, waitFor: 'button' },

  // ── Scene 1: 探す ─────────────────────────────────
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
    id: 'explore-nearby',
    phase: 'explore',
    instruction: 'ここをタップすると\n近くのスポットが見つかります',
    target: 'nearby-fab',
    waitFor: 'tap-target',
  },
  {
    id: 'explore-result',
    phase: 'explore',
    instruction: '気になるスポットをタップしてみましょう',
    target: 'search-result-card',
    waitFor: 'tap-target',
  },
  {
    id: 'explore-nav',
    phase: 'explore',
    instruction: '案内開始でナビアプリに飛べます\nタップしてみましょう',
    target: 'nav-button',
    waitFor: 'tap-target',
  },

  // ── Phase: Explore（検索を知る） ──────────────────
  {
    id: 'explore-search',
    phase: 'explore',
    instruction: '行き先を調べたい時はここ\nタップしてみましょう',
    target: 'search-tab',
    waitFor: 'tap-target',
  },
  {
    id: 'explore-search-info',
    phase: 'explore',
    instruction: '人気エリアの「上野」を\nタップしてみよう',
    target: 'hot-area-ueno',
    waitFor: 'tap-target',
  },
  {
    id: 'explore-search-result',
    phase: 'explore',
    instruction: '検索先のエリア周辺の\n最寄りスポットが表示されます',
    target: null,
    waitFor: 'tap-anywhere',
  },

  // ── Scene 2: 気配を体感 ───────────────────────────
  {
    id: 'scene-presence',
    phase: 'presence',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    sceneTitle: 'スポットの「気配」',
    sceneIcon: 'pulse-outline',
  },

  // ── Phase: Presence（気配の意味） ─────────────────
  {
    id: 'presence-intro',
    phase: 'presence',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
    customUI: 'presence-intro',
  },
  {
    id: 'presence-action-intro',
    phase: 'presence',
    instruction: '気配はワンショットで更新されます\n実際にやってみましょう',
    target: null,
    waitFor: 'tap-anywhere',
  },
  {
    id: 'presence-show-untouched',
    phase: 'presence',
    instruction: 'これが silent（未踏）のスポット\nまだ誰も気配を残していません',
    target: null,
    waitFor: 'tap-anywhere',
  },
  {
    id: 'presence-camera',
    phase: 'presence',
    instruction: 'ワンショットボタンをタップ',
    target: 'camera-button',
    waitFor: 'tap-target',
  },
  {
    id: 'presence-ceremony',
    phase: 'presence',
    instruction: '',
    target: null,
    waitFor: 'tap-anywhere',
  },
  {
    id: 'presence-done',
    phase: 'presence',
    instruction: 'ワンショットで気配が live に変わりました\n看板など文字が写っていれば\nスポット名や料金などの登録情報も自動で更新されます',
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
  updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2日前更新
};

/** チュートリアル: 気配セクション用の未踏（silent）ダミースポット */
export const DUMMY_UNTOUCHED_SPOT: ParkingPin = {
  id: '_tutorial_untouched_',
  name: '丸の内仲通り駐輪場',
  latitude: 35.6790,    // 東京駅 西側の丸の内エリア
  longitude: 139.7660,
  maxCC: null,
  isFree: null,
  capacity: null,
  source: 'seed',
  address: '東京都千代田区丸の内2丁目',
  // lastConfirmedAt 未設定 → silent 扱い
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

/** チュートリアル: 上野周辺の最寄り3件（テキスト検索デモ用） */
export const TUTORIAL_SEARCH_RESULTS: { spot: ParkingPin; distanceM: number }[] = [
  {
    spot: {
      id: '_tutorial_spot_ueno1', name: '上野駅前バイク駐車場',
      latitude: 35.7138, longitude: 139.7770, maxCC: null,
      isFree: false, capacity: 20, source: 'seed',
      address: '東京都台東区上野7丁目', priceInfo: '¥150/h',
      updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
    distanceM: 80,
  },
  {
    spot: {
      id: '_tutorial_spot_ueno2', name: 'アメ横バイク駐輪場',
      latitude: 35.7100, longitude: 139.7745, maxCC: null,
      isFree: false, capacity: 12, source: 'seed',
      address: '東京都台東区上野4丁目',
      updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
    distanceM: 250,
  },
  {
    spot: {
      id: '_tutorial_spot_ueno3', name: '上野公園口駐輪場',
      latitude: 35.7155, longitude: 139.7735, maxCC: 125,
      isFree: true, capacity: 25, source: 'seed',
      address: '東京都台東区上野公園',
      updatedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    },
    distanceM: 420,
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
  /** 気配セクション用の未踏ダミースポット（confirmed後はlive） */
  dummyUntouchedSpot: ParkingPin;
  /** 気配セクション内で未踏ダミーがワンショット済みになったら true（色変化トリガー） */
  untouchedConfirmed: boolean;
  /** 未踏ダミーをワンショット済みに切替（lastConfirmedAt = 現在時刻） */
  markUntouchedConfirmed: () => void;
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
  const [untouchedConfirmed, setUntouchedConfirmed] = useState(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentStep = STEPS[stepIndex] ?? STEPS[0];
  const phase = active ? currentStep.phase : 'inactive';

  // 未踏ダミー: confirmed フラグに応じて lastConfirmedAt を付与
  const dummyUntouchedSpot = useMemo<ParkingPin>(() => {
    if (untouchedConfirmed) {
      return { ...DUMMY_UNTOUCHED_SPOT, lastConfirmedAt: new Date().toISOString() };
    }
    return DUMMY_UNTOUCHED_SPOT;
  }, [untouchedConfirmed]);

  const markUntouchedConfirmed = useCallback(() => {
    setUntouchedConfirmed(true);
  }, []);

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
    setUntouchedConfirmed(false);
    targets.current = {};
  }, []);

  const finishTutorial = useCallback(() => {
    setExiting(true);
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    // フェードアウト用に400ms待ってからアンマウント
    setTimeout(() => {
      setActive(false);
      setExiting(false);
      setStepIndex(0);
      setUntouchedConfirmed(false);
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
    dummyUntouchedSpot,
    untouchedConfirmed,
    markUntouchedConfirmed,
    registerTarget,
    getTarget,
    advanceTutorial,
    startTutorial,
    finishTutorial,
    isStep,
  }), [active, exiting, stepIndex, currentStep, phase, dummySpot, dummyUntouchedSpot, untouchedConfirmed, markUntouchedConfirmed, registerTarget, getTarget, advanceTutorial, startTutorial, finishTutorial, isStep]);

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
