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
import { Ionicons } from '@expo/vector-icons';
import { useTutorial, type TargetRect } from '../contexts/TutorialContext';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PADDING = 8; // ターゲット周囲のパディング

export function TutorialGuide() {
  const { active, exiting, currentStep, stepIndex, getTarget, advanceTutorial, phase } = useTutorial();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;
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

  // ステップ切替: 暗幕維持 + コンテンツだけフェード（地図が見える隙間を防ぐ）
  useEffect(() => {
    if (active && phase !== 'setup' && phase !== 'complete') {
      const isFirstAppearance = prevStepRef.current === 0 && stepIndex > 0;
      prevStepRef.current = stepIndex;

      if (isFirstAppearance) {
        // 初回表示: 暗幕ごとフェードイン
        fadeAnim.setValue(0);
        contentAnim.setValue(0);
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(contentAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]).start();
      } else {
        // 通常遷移: 暗幕維持、コンテンツだけフェード
        fadeAnim.setValue(1);
        contentAnim.setValue(0);
        Animated.timing(contentAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      }

      // パルスグロー（ピカピカ — 常に光ってる＋脈動）
      pulseAnim.setValue(0.5);
      pulseRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.5, duration: 500, useNativeDriver: true }),
        ])
      );
      pulseRef.current.start();
    } else {
      pulseRef.current?.stop();
    }
  }, [active, stepIndex, phase]);

  // complete フェーズへの遷移: フェードアウト（地図が見える隙間を防ぐ）
  useEffect(() => {
    if (active && phase === 'complete') {
      setFadingToComplete(true);
      Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
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

  // ── シーンタイトルカード（フェーズ切替演出） ────────
  if (!target && currentStep.sceneTitle) {
    return (
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <Animated.View style={[styles.sceneOverlay, { opacity: fadeAnim }]}>
          <Animated.View style={{ alignItems: 'center', gap: 16, opacity: contentAnim }}>
          <Ionicons name={(currentStep.sceneIcon ?? 'compass-outline') as keyof typeof Ionicons.glyphMap} size={48} color="#FF9F0A" />
          <Text style={styles.sceneTitle}>{currentStep.sceneTitle}</Text>
          <View style={styles.tapHintRow}>
            <Text style={styles.tapHint}>タップして次へ</Text>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.5)" />
          </View>
          </Animated.View>
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
          <Animated.View style={[styles.floatingCard, { opacity: contentAnim }]}>
            <Text style={styles.instructionText}>{currentStep.instruction}</Text>
          </Animated.View>
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
            <Animated.View style={[styles.floatingCard, { opacity: contentAnim }]}>
              <Text style={styles.instructionText}>{currentStep.instruction}</Text>
              <View style={styles.tapHintRow}>
                <Text style={styles.tapHint}>タップして次へ</Text>
                <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.5)" />
              </View>
            </Animated.View>
          ) : null}
        </Animated.View>
      </TouchableWithoutFeedback>
    );
  }

  // ターゲットあり: スポットライト（4つの暗幕 + 穴）
  // コンテナ原点を差し引いて座標を補正（Android edge-to-edge対応）
  const ox = originRef.current.x;
  const oy = originRef.current.y;
  const hole = {
    x: target.x - PADDING - ox,
    y: target.y - PADDING - oy,
    w: target.w + PADDING * 2,
    h: target.h + PADDING * 2,
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
      <Animated.View
        style={[styles.glowBorder, {
          top: hole.y,
          left: hole.x,
          width: hole.w,
          height: hole.h,
          borderRadius: hole.borderRadius,
          opacity: pulseAnim,
        }]}
        pointerEvents="none"
      />

      {/* ── 指示テキスト ─────────────────────────────── */}
      {/* fadeAnim を使用: ターゲット到着ポーリング後にビューが切り替わるため
          contentAnim のネイティブドライバー値が伝播しないケースを回避 */}
      {currentStep.instruction ? (
        <Animated.View style={[
          styles.instructionCard,
          { top: instructionTop, opacity: contentAnim },
        ]}>
          <Text style={styles.instructionText}>{currentStep.instruction}</Text>
          {currentStep.waitFor === 'tap-anywhere' && (
            <View style={styles.tapHintRow}>
              <Text style={styles.tapHint}>タップして次へ</Text>
              <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.5)" />
            </View>
          )}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

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
    left: 20,
    right: 20,
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
    left: 20,
    right: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.80)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
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
});
