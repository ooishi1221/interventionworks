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
import React, { useEffect, useRef } from 'react';
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
  const { active, currentStep, stepIndex, getTarget, advanceTutorial, phase } = useTutorial();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  // フェードイン
  useEffect(() => {
    if (active && phase !== 'setup' && phase !== 'complete') {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();

      // パルスグロー
      pulseAnim.setValue(0.4);
      pulseRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
        ])
      );
      pulseRef.current.start();
    } else {
      pulseRef.current?.stop();
    }
  }, [active, stepIndex, phase]);

  // セットアップと完了フェーズはTutorialOverlayが処理する
  if (!active || phase === 'setup' || phase === 'complete') return null;
  // auto ステップは何も表示しない（タイマーで自動遷移）
  if (currentStep.waitFor === 'auto') return null;

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
          <Ionicons name={(currentStep.sceneIcon ?? 'compass-outline') as any} size={48} color="#FF9F0A" />
          <Text style={styles.sceneTitle}>{currentStep.sceneTitle}</Text>
          <View style={styles.tapHintRow}>
            <Text style={styles.tapHint}>タップして次へ</Text>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.5)" />
          </View>
        </Animated.View>
      </TouchableWithoutFeedback>
    );
  }

  // ── tap-target + ターゲット未測定: タッチ貫通（コンポーネントがadvance）
  if (!target && currentStep.waitFor === 'tap-target') {
    return (
      <Animated.View style={[styles.fullOverlayLight, { opacity: fadeAnim }]} pointerEvents="box-none">
        {currentStep.instruction ? (
          <View style={styles.floatingCard} pointerEvents="none">
            <Text style={styles.instructionText}>{currentStep.instruction}</Text>
          </View>
        ) : null}
      </Animated.View>
    );
  }

  // ── ターゲットなし + tap-anywhere: 薄暗幕 + 指示テキスト
  if (!target) {
    return (
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <Animated.View style={[styles.fullOverlayLight, { opacity: fadeAnim }]}>
          {currentStep.instruction ? (
            <View style={styles.floatingCard}>
              <Text style={styles.instructionText}>{currentStep.instruction}</Text>
              <View style={styles.tapHintRow}>
                <Text style={styles.tapHint}>タップして次へ</Text>
                <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.5)" />
              </View>
            </View>
          ) : null}
        </Animated.View>
      </TouchableWithoutFeedback>
    );
  }

  // ターゲットあり: スポットライト（4つの暗幕 + 穴）
  const hole = {
    x: target.x - PADDING,
    y: target.y - PADDING,
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
  const instructionAbove = spaceAbove > spaceBelow;
  // 上: 空きスペースの中央 / 下: ターゲット直下
  const CARD_HEIGHT_EST = 80; // 指示カードの推定高さ
  const instructionTop = instructionAbove
    ? Math.max(SAFE_TOP, hole.y / 2 - CARD_HEIGHT_EST / 2)
    : hole.y + hole.h + 16;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]} pointerEvents="box-none">
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
      {currentStep.instruction ? (
        <View style={[
          styles.instructionCard,
          { top: instructionTop },
        ]}>
          <Text style={styles.instructionText}>{currentStep.instruction}</Text>
          {currentStep.waitFor === 'tap-anywhere' && (
            <View style={styles.tapHintRow}>
              <Text style={styles.tapHint}>タップして次へ</Text>
              <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.5)" />
            </View>
          )}
        </View>
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
  fullOverlayLight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 9998,
  },
  backdrop: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.70)',
  },
  glowBorder: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#0A84FF',
  },
  floatingCard: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 70 : 50,
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
