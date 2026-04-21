/**
 * TutorialGuide — スポットライト + 指示テキスト
 *
 * ターゲット要素を「穴」として残し、周囲を暗幕で覆う。
 * pointerEvents の制御:
 * - 暗幕部分: tap-anywhere ステップなら onPress で次へ進む
 *             tap-target ステップなら touches をブロック（誤タップ防止）
 * - 穴（ターゲット部分）: pointerEvents="box-none" で下のUIに貫通
 *
 * ターゲットがない場合: 全面タップで次へ進む
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useTutorial, type TargetRect } from '../contexts/TutorialContext';
import { FRESHNESS_STYLE, type SpotFreshness } from '../utils/freshness';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PADDING = 8; // ターゲット周囲のパディング
const SAFE_MARGIN = 20; // チュートリアルカード共通の左右セーフマージン (>= 16dp)

// ─── StepFadeIn ───────────────────────────────────────
// 各ステップでの content fade-in。stepIndex を key にして使うことで、
// ステップ切替時に新しい Animated.Value (初期値 0) を持つインスタンスとして mount される。
// 共有 Animated.Value 方式の「opacity 1 → JSX 差替え → 一瞬全表示 → setValue(0) → fade-in」
// という flicker を構造的に排除する。
const StepFadeIn = React.memo(function StepFadeIn({
  children,
  delay = 120,
  duration = 480,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: any;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration, delay, useNativeDriver: true }),
      Animated.timing(ty,      { toValue: 0, duration, delay, useNativeDriver: true }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY: ty }] }]}>
      {children}
    </Animated.View>
  );
});

export function TutorialGuide() {
  const { active, exiting, currentStep, stepIndex, getTarget, advanceTutorial, phase } = useTutorial();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);
  const prevStepRef = useRef(stepIndex);
  const [fadingToComplete, setFadingToComplete] = useState(false);

  // ── Android edge-to-edge 座標補正 ────────────────────
  // measureInWindow はスクリーン絶対座標を返すが、
  // absoluteFillObject のコンテナ原点がステータスバー分ズレる場合がある。
  // コンテナ自身の原点を測定して差し引く。
  const spotlightRef = useRef<View>(null);
  const originRef = useRef({ x: 0, y: 0 });

  // 暗幕の opacity だけ管理。コンテンツの fade は <StepFadeIn key={stepIndex}> に委譲。
  // 共有 contentAnim 方式は「state 更新→新JSXが opacity 1 で1フレーム表示→useEffect で setValue(0)→fade-in」のフリッカーを起こすため廃止。
  useEffect(() => {
    if (active && phase !== 'setup' && phase !== 'complete') {
      const isFirstAppearance = prevStepRef.current === 0 && stepIndex > 0;
      prevStepRef.current = stepIndex;
      if (isFirstAppearance) {
        fadeAnim.setValue(0);
        Animated.timing(fadeAnim, { toValue: 1, duration: 550, useNativeDriver: true }).start();
      } else {
        fadeAnim.setValue(1); // 暗幕は維持
      }
      // パルスグロー（ターゲット周囲）
      pulseAnim.setValue(0.5);
      pulseRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.5, duration: 600, useNativeDriver: true }),
        ])
      );
      pulseRef.current.start();
    } else {
      pulseRef.current?.stop();
    }
  }, [active, stepIndex, phase]);

  // complete フェーズへの遷移: 暗幕フェードアウト
  useEffect(() => {
    if (active && phase === 'complete') {
      setFadingToComplete(true);
      Animated.timing(fadeAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
        setFadingToComplete(false);
      });
    }
  }, [phase, active]);

  // 終了時フェードアウト
  useEffect(() => {
    if (exiting) {
      pulseRef.current?.stop();
      Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start();
    }
  }, [exiting]);

  // ── ターゲット到着待ち ─────────────────────────────
  // ステップ削減でUI表示とスポットライトが同時になるケースがある。
  // ターゲットが定義されているが未測定の場合、200ms間隔で再チェック。
  const [, forceRender] = useState(0);

  const measureOrigin = useCallback(() => {
    spotlightRef.current?.measureInWindow((x, y) => {
      if (originRef.current.x !== x || originRef.current.y !== y) {
        originRef.current = { x, y };
        forceRender(v => v + 1);
      }
    });
  }, []);

  useEffect(() => {
    if (!active || !currentStep.target) return;
    const found = getTarget(currentStep.target);
    if (found) return;
    const timer = setInterval(() => {
      if (getTarget(currentStep.target!)) {
        clearInterval(timer);
        forceRender(v => v + 1);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [active, stepIndex, currentStep.target, getTarget]);

  // セットアップはTutorialOverlayが処理する
  // exiting中はフェードアウトのため表示を維持
  if ((!active && !exiting) || phase === 'setup') return null;
  if (phase === 'complete' && !fadingToComplete) return null;
  // セレモニー演出中はOneshotCeremonyが全面を担当
  if (currentStep.id === 'presence-ceremony') return null;

  // complete フェーズへのフェードアウト中: 暗幕のみ表示
  if (phase === 'complete' && fadingToComplete) {
    return (
      <Animated.View style={[styles.sceneOverlay, { opacity: fadeAnim }]} pointerEvents="none" />
    );
  }
  const target = currentStep.target ? getTarget(currentStep.target) : null;

  const handleBackdropPress = () => {
    if (currentStep.waitFor === 'tap-anywhere') {
      advanceTutorial();
    }
    // tap-target の場合は暗幕タップでは進まない
  };

  // ── 気配の説明パネル（customUI: 'presence-intro'） ────────
  if (currentStep.customUI === 'presence-intro') {
    return (
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <Animated.View style={[styles.sceneOverlay, { opacity: fadeAnim, paddingHorizontal: SAFE_MARGIN }]}>
          <StepFadeIn key={`presence-intro-${stepIndex}`} style={styles.presencePanelInner}>
            <Text style={styles.presenceTitle}>Moto-Logos のスポットには{'\n'}「気配」があります</Text>
            <Text style={styles.presenceSubtitle}>ライダーがどれだけ最近そこに立ち寄ったか{'\n'}を6段階の色で表現します</Text>
            <View style={styles.presenceList}>
              {PRESENCE_ROWS.map((row, i) => (
                <PresenceRow key={row.level} index={i} {...row} />
              ))}
            </View>
            <View style={styles.tapHintRow}>
              <Text style={styles.tapHint}>タップして次へ</Text>
              <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.5)" />
            </View>
          </StepFadeIn>
        </Animated.View>
      </TouchableWithoutFeedback>
    );
  }

  // ── シーンタイトルカード（フェーズ切替演出） ────────
  if (!target && currentStep.sceneTitle) {
    return (
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <Animated.View style={[styles.sceneOverlay, { opacity: fadeAnim, paddingHorizontal: SAFE_MARGIN }]}>
          <StepFadeIn key={`scene-${stepIndex}`} delay={200} style={styles.sceneInner}>
            <Ionicons name={(currentStep.sceneIcon ?? 'compass-outline') as keyof typeof Ionicons.glyphMap} size={48} color="#FF9F0A" />
            <Text style={styles.sceneTitle}>{currentStep.sceneTitle}</Text>
            <View style={styles.tapHintRow}>
              <Text style={styles.tapHint}>タップして次へ</Text>
              <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.5)" />
            </View>
          </StepFadeIn>
        </Animated.View>
      </TouchableWithoutFeedback>
    );
  }

  // ── tap-target でターゲット未取得（定義なし or 測定未完了）: 完全タッチ貫通
  //    pointerEvents="none" で全タッチを下のUIに通す。コンポーネント側がadvance
  //    Animated.View を使わない: useNativeDriver でシーン→通常ステップ遷移時に
  //    fadeAnim の JS 値が 0 のまま残りオーバーレイが見えなくなる問題を回避
  if (!target && currentStep.waitFor === 'tap-target') {
    return (
      <Animated.View style={[styles.fullOverlayLight, { opacity: fadeAnim }]} pointerEvents="none">
        {currentStep.instruction ? (
          <StepFadeIn key={`tap-target-no-target-${stepIndex}`} style={styles.floatingCard}>
            <Text style={styles.instructionText}>{currentStep.instruction}</Text>
          </StepFadeIn>
        ) : null}
      </Animated.View>
    );
  }

  // ── ターゲットなし + tap-anywhere: どこタップしても次へ
  if (!target) {
    return (
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <Animated.View style={[styles.fullOverlayClear, { opacity: fadeAnim }]}>
          {currentStep.instruction ? (
            <StepFadeIn key={`tap-anywhere-${stepIndex}`} style={styles.floatingCard}>
              <Text style={styles.instructionText}>{currentStep.instruction}</Text>
              <View style={styles.tapHintRow}>
                <Text style={styles.tapHint}>タップして次へ</Text>
                <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.5)" />
              </View>
            </StepFadeIn>
          ) : null}
        </Animated.View>
      </TouchableWithoutFeedback>
    );
  }

  // ターゲットあり: スポットライト（4つの暗幕 + 穴）
  // コンテナ原点を差し引いて座標を補正（Android edge-to-edge対応）
  const ox = originRef.current.x;
  const oy = originRef.current.y;
  // ターゲット矩形を画面内に収める。タブバー右端のターゲットが
  // glowBorder ごと右にはみ出る不具合を防ぐ。
  const rawX = target.x - PADDING - ox;
  const rawY = target.y - PADDING - oy;
  const rawW = target.w + PADDING * 2;
  const rawH = target.h + PADDING * 2;
  const clampedX = Math.max(0, Math.min(rawX, SCREEN_W - rawW));
  const clampedY = Math.max(0, rawY);
  const hole = {
    x: clampedX,
    y: clampedY,
    w: Math.min(rawW, SCREEN_W - clampedX),
    h: rawH,
    borderRadius: (target.borderRadius ?? 0) + PADDING / 2,
  };

  // 指示テキストの位置: 上下の空きスペースが広い方に配置
  // top で統一指定（bottom だとセーフエリアでズレるため）
  const SAFE_TOP = Platform.OS === 'ios' ? 60 : 40;
  const SAFE_BOTTOM = Platform.OS === 'ios' ? 100 : 80;
  const spaceAbove = hole.y - SAFE_TOP;
  const spaceBelow = SCREEN_H - SAFE_BOTTOM - (hole.y + hole.h);
  // 上の空きスペースが十分（200px以上）なら上、そうでなければ下
  const instructionAbove = spaceAbove > 200 && spaceAbove > spaceBelow;
  const CARD_HEIGHT_EST = 90;
  const GAP = 24;
  // 下半分のスペースの中央に配置（ターゲットの下）
  const belowCenter = hole.y + hole.h + (SCREEN_H - SAFE_BOTTOM - hole.y - hole.h) / 2 - CARD_HEIGHT_EST / 2;
  const instructionTop = instructionAbove
    ? Math.max(SAFE_TOP, hole.y - CARD_HEIGHT_EST - GAP)
    : Math.max(hole.y + hole.h + GAP, Math.min(belowCenter, SCREEN_H - SAFE_BOTTOM - CARD_HEIGHT_EST));

  return (
    <Animated.View
      ref={spotlightRef}
      style={[styles.container, { opacity: fadeAnim }]}
      pointerEvents="box-none"
      onLayout={measureOrigin}
    >
      {/* ── 4つの暗幕矩形 ──────────────────────────── */}

      {/* 上 */}
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={[styles.backdrop, { top: 0, left: 0, right: 0, height: hole.y }]} />
      </TouchableWithoutFeedback>

      {/* 下 */}
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={[styles.backdrop, { top: hole.y + hole.h, left: 0, right: 0, bottom: 0 }]} />
      </TouchableWithoutFeedback>

      {/* 左 */}
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={[styles.backdrop, { top: hole.y, left: 0, width: hole.x, height: hole.h }]} />
      </TouchableWithoutFeedback>

      {/* 右 */}
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={[styles.backdrop, {
          top: hole.y,
          left: hole.x + hole.w,
          right: 0,
          height: hole.h,
        }]} />
      </TouchableWithoutFeedback>

      {/* ── パルスグロー枠（ターゲット周囲） ────────── */}
      {/* opacity 脈動 + scale 1.0 ↔ 1.06 で視線誘導を強化。
          ターゲット中央を基準にスケールするため transform-origin の代替として
          left/top を一定に保ったまま scale を transform で適用 */}
      <Animated.View
        style={[styles.glowBorder, {
          top: hole.y,
          left: hole.x,
          width: hole.w,
          height: hole.h,
          borderRadius: hole.borderRadius,
          opacity: pulseAnim,
          transform: [{
            scale: pulseAnim.interpolate({
              inputRange: [0.5, 1],
              outputRange: [1.0, 1.06],
            }),
          }],
        }]}
        pointerEvents="none"
      />

      {/* ── 指示テキスト ─────────────────────────────── */}
      {currentStep.instruction ? (
        <StepFadeIn key={`spot-instr-${stepIndex}`} style={[styles.instructionCard, { top: instructionTop }]}>
          <Text style={styles.instructionText}>{currentStep.instruction}</Text>
          {currentStep.waitFor === 'tap-anywhere' && (
            <View style={styles.tapHintRow}>
              <Text style={styles.tapHint}>タップして次へ</Text>
              <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.5)" />
            </View>
          )}
        </StepFadeIn>
      ) : null}
    </Animated.View>
  );
}

// ─── 気配説明用のミニ行（スタッガーフェードイン付き） ──────
type PresenceRowProps = { level: SpotFreshness; label: string; meaning: string };
const PRESENCE_ROWS: PresenceRowProps[] = [
  { level: 'live',   label: 'live',   meaning: '濃い気配 (1ヶ月以内)' },
  { level: 'warm',   label: 'warm',   meaning: '温かい気配 (1〜2ヶ月)' },
  { level: 'trace',  label: 'trace',  meaning: '痕跡が残る (2〜3ヶ月)' },
  { level: 'faint',  label: 'faint',  meaning: '薄れた気配 (3〜6ヶ月)' },
  { level: 'cold',   label: 'cold',   meaning: '冷えきった (半年以上)' },
  { level: 'silent', label: 'silent', meaning: '静寂・誰も来ていない' },
];
const PresenceRow = React.memo(function PresenceRow({ level, label, meaning, index }: PresenceRowProps & { index: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    // パネル全体のフェードイン (contentAnim) より少し遅らせてスタッガー
    const startDelay = 240 + index * 90;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1, duration: 380, delay: startDelay, useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0, duration: 380, delay: startDelay, useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, translateY]);

  const { color, textColor } = FRESHNESS_STYLE[level];
  const isSilent = level === 'silent';
  return (
    <Animated.View style={[styles.presenceRow, { opacity, transform: [{ translateY }] }]}>
      <View
        style={[
          styles.presencePin,
          isSilent
            ? { backgroundColor: 'transparent', borderWidth: 2, borderColor: '#9A9A9E' }
            : { backgroundColor: color, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' },
        ]}
      >
        <FontAwesome5 name="motorcycle" size={11} color={isSilent ? '#9A9A9E' : textColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.presenceLabel, { color: isSilent ? '#E8E8E8' : color }]}>{label}</Text>
        <Text style={styles.presenceMeaning}>{meaning}</Text>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9998,
  },
  sceneOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.88)',
    zIndex: 9998,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  sceneTitle: {
    color: '#F2F2F7',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  fullOverlayClear: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.01)',
    zIndex: 9998,
    justifyContent: 'center',
  },
  fullOverlayLight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 9998,
    justifyContent: 'center',
  },
  backdrop: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.70)',
  },
  glowBorder: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#FF9F0A',
    shadowColor: '#FF9F0A',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    shadowOpacity: 1,
    elevation: 12,
    backgroundColor: 'rgba(255,159,10,0.08)',
  },
  floatingCard: {
    marginHorizontal: SAFE_MARGIN,
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  instructionCard: {
    position: 'absolute',
    left: SAFE_MARGIN,
    right: SAFE_MARGIN,
    maxWidth: SCREEN_W - SAFE_MARGIN * 2,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.80)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  sceneInner: {
    alignItems: 'center',
    gap: 16,
    maxWidth: SCREEN_W - SAFE_MARGIN * 2,
  },
  presencePanelInner: {
    width: '100%',
    maxWidth: SCREEN_W - SAFE_MARGIN * 2,
    alignItems: 'center',
    gap: 18,
  },
  instructionText: {
    color: '#F2F2F7',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 26,
  },
  tapHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  tapHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '500',
  },

  // ── 気配説明パネル ──────────────────────────────
  presenceTitle: {
    color: '#F2F2F7',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 30,
  },
  presenceSubtitle: {
    color: '#8E8E93',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: -4,
  },
  presenceList: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  presenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  presencePin: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  presenceLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  presenceMeaning: {
    color: '#9A9A9E',
    fontSize: 11,
    marginTop: 1,
  },
});
