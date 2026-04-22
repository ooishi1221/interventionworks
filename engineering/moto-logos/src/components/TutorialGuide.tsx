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
import { Image } from 'expo-image';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useTutorial, type TargetRect, DUMMY_SPOT } from '../contexts/TutorialContext';
import { FRESHNESS_STYLE, type SpotFreshness } from '../utils/freshness';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PADDING = 10; // ターゲット周囲のパディング（ズレ吸収のため余裕をもたせる）
const SAFE_MARGIN = 20; // チュートリアルカード共通の左右セーフマージン (>= 16dp)

// ── 浮遊アニメーション付き「タップして次へ」 ─────────────
function FloatingTapHint() {
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: -4, duration: 1200, useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ]),
    ).start();
  }, [float]);
  return (
    <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }, { transform: [{ translateY: float }] }]}>
      <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '500' }}>タップして次へ</Text>
      <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.5)" />
    </Animated.View>
  );
}

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
      Animated.timing(fadeAnim, { toValue: 0, duration: 700, useNativeDriver: true }).start(() => {
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
    }, 100);
    return () => clearInterval(timer);
  }, [active, stepIndex, currentStep.target, getTarget]);

  // セットアップはTutorialOverlayが処理する
  // exiting中はフェードアウトのため表示を維持
  if ((!active && !exiting) || phase === 'setup') return null;
  if (phase === 'complete' && !fadingToComplete) return null;
  // セレモニー演出中は全面OneshotCeremonyが担当
  if (currentStep.id === 'arrive-ceremony' || currentStep.id === 'newspot-ceremony') return null;

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

  // ── 案内中バナー説明（customUI: 'explore-banner'）— 薄暗幕でバナー+ピン見せる＋ハイライト枠 ──
  if (currentStep.customUI === 'explore-banner') {
    return (
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <Animated.View style={[styles.exploreBannerOverlay, { opacity: fadeAnim }]}>
          {/* バナーのハイライト枠 */}
          <View style={styles.bannerFrame} />
          <StepFadeIn key={`banner-${stepIndex}`} style={styles.centerCard}>
            <Text style={styles.instructionText}>{currentStep.instruction}</Text>
            <FloatingTapHint />
          </StepFadeIn>
        </Animated.View>
      </TouchableWithoutFeedback>
    );
  }

  // ── B-4: 確認カード（customUI: 'explore-nav-confirm'）── モックナビモーダル + テキスト
  if (currentStep.customUI === 'explore-nav-confirm') {
    return (
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <Animated.View style={[styles.navConfirmOverlay, { opacity: fadeAnim }]}>
          {/* 上部テキスト */}
          <StepFadeIn key={`nav-confirm-${stepIndex}`} style={styles.navConfirmTextWrap}>
            <Text style={styles.instructionText}>住所をコピーで{'\n'}好きなナビアプリを使用することもできます</Text>
          </StepFadeIn>
          {/* モックナビモーダル（実物と同じデザイン） */}
          <StepFadeIn key={`nav-modal-${stepIndex}`} delay={200} style={styles.mockNavModal}>
            <Text style={styles.mockNavTitle}>案内開始</Text>
            <Text style={styles.mockNavSub} numberOfLines={2}>{DUMMY_SPOT.name}</Text>
            <View style={styles.mockNavOption}>
              <Ionicons name="navigate-circle" size={22} color="#0A84FF" />
              <Text style={styles.mockNavOptionText}>Googleマップ</Text>
            </View>
            <View style={styles.mockNavOption}>
              <Ionicons name="copy-outline" size={22} color="#8E8E93" />
              <Text style={styles.mockNavOptionText}>住所をコピー</Text>
            </View>
            <View style={styles.mockNavCancel}>
              <Text style={styles.mockNavCancelText}>キャンセル</Text>
            </View>
          </StepFadeIn>
          <FloatingTapHint />
        </Animated.View>
      </TouchableWithoutFeedback>
    );
  }

  // ── C-2: 到着通知（customUI: 'arrive-notify'）── モック通知カード（タップで次へ）
  if (currentStep.customUI === 'arrive-notify') {
    return (
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <Animated.View style={[styles.fullOverlayClear, { opacity: fadeAnim }]}>
          <StepFadeIn key={`notify-${stepIndex}`} style={styles.centerCard}>
            <Text style={styles.instructionText}>通知カードをタップしてみましょう</Text>
            {/* モック通知カード */}
            <View style={styles.mockNotif}>
              <View style={styles.mockNotifRow}>
                <View style={styles.mockNotifIcon}>
                  <Ionicons name="location" size={16} color="#FF6B00" />
                </View>
                <Text style={styles.mockNotifApp}>Moto-Logos</Text>
                <Text style={styles.mockNotifTime}>今</Text>
              </View>
              <Text style={styles.mockNotifTitle}>東京駅八重洲口バイク駐車場に着いた？</Text>
              <Text style={styles.mockNotifBody}>バイクの場所、残しとく？</Text>
            </View>
            <FloatingTapHint />
          </StepFadeIn>
        </Animated.View>
      </TouchableWithoutFeedback>
    );
  }

  // ── C-4b: 気配の色変更を見せる（customUI: 'arrive-result'）── 薄暗幕でスポットカード見せる
  if (currentStep.customUI === 'arrive-result') {
    return (
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <Animated.View style={[styles.arriveResultOverlay, { opacity: fadeAnim }]}>
          <StepFadeIn key={`arrive-result-${stepIndex}`} style={styles.arriveResultCard}>
            <Text style={styles.instructionText}>足跡を刻みました</Text>
            <Text style={[styles.instructionText, { fontSize: 15, color: '#AEAEB2', marginTop: -4 }]}>スポットの気配と情報が更新されます</Text>
            <FloatingTapHint />
          </StepFadeIn>
        </Animated.View>
      </TouchableWithoutFeedback>
    );
  }

  // ── D-1: 新規登録説明（customUI: 'newspot-explain'）── フッターモック付き
  if (currentStep.customUI === 'newspot-explain') {
    return (
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <Animated.View style={[styles.fullOverlayClear, { opacity: fadeAnim }]}>
          <StepFadeIn key={`newspot-${stepIndex}`} style={styles.centerCard}>
            <Text style={styles.instructionText}>停めた場所にスポット表示がない場合{'\n'}ボタンが ＋ に変わります</Text>
            {/* フッターモック */}
            <View style={styles.mockFooterBar}>
              <Ionicons name="home-outline" size={24} color="#8E8E93" />
              <Ionicons name="search-outline" size={24} color="#8E8E93" />
              <View style={styles.mockPlusBtn}>
                <Ionicons name="add" size={28} color="#fff" />
              </View>
              <Ionicons name="person-outline" size={24} color="#8E8E93" />
              <Ionicons name="settings-outline" size={24} color="#8E8E93" />
            </View>
            <FloatingTapHint />
          </StepFadeIn>
        </Animated.View>
      </TouchableWithoutFeedback>
    );
  }

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
            <FloatingTapHint />
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
            <FloatingTapHint />
          </StepFadeIn>
        </Animated.View>
      </TouchableWithoutFeedback>
    );
  }

  // ── tap-target でターゲット未取得（定義なし or 測定未完了）:
  //    完全タッチ貫通のみ。指示テキストは出さない。
  //    target が測定されてからスポットライト+メッセージを一気に出す方が、
  //    SearchOverlay 等が開く瞬間に「読めない一瞬の文字」が flash するのを防げる。
  if (!target && currentStep.waitFor === 'tap-target') {
    return (
      <Animated.View style={[styles.fullOverlayLight, { opacity: fadeAnim }]} pointerEvents="none" />
    );
  }

  // ── ターゲットなし + tap-anywhere: どこタップしても次へ（テキストは下部固定）
  if (!target) {
    return (
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <Animated.View style={[styles.fullOverlayClear, { opacity: fadeAnim }]}>
          {currentStep.instruction ? (
            <StepFadeIn key={`tap-anywhere-${stepIndex}`} style={styles.centerCard}>
              <Text style={styles.instructionText}>{currentStep.instruction}</Text>
              <FloatingTapHint />
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

  // 指示テキストの位置: 常に画面中央

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
        <StepFadeIn key={`spot-instr-${stepIndex}`} style={styles.spotlightCard}>
          <Text style={styles.instructionText}>{currentStep.instruction}</Text>
          {currentStep.waitFor === 'tap-anywhere' && (
            <FloatingTapHint />
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
    backgroundColor: 'rgba(0,0,0,0.95)',
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
  exploreBannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 9998,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SAFE_MARGIN,
  },
  bannerFrame: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 67 : 44,
    left: 14,
    right: 14,
    height: 38,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FF9F0A',
    ...Platform.select({
      ios: { shadowColor: '#FF9F0A', shadowOffset: { width: 0, height: 0 }, shadowRadius: 10, shadowOpacity: 0.7 },
      default: {},
    }),
  },
  fullOverlayClear: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 9998,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SAFE_MARGIN,
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
    // elevation除去（Android重い）
    backgroundColor: 'rgba(255,159,10,0.08)',
  },
  centerCard: {
    width: '100%',
    maxWidth: SCREEN_W - SAFE_MARGIN * 2,
    alignItems: 'center',
    gap: 14,
  },
  spotlightCard: {
    position: 'absolute',
    top: SCREEN_H * 0.38,
    left: SAFE_MARGIN,
    right: SAFE_MARGIN,
    alignItems: 'center',
    gap: 10,
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
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 28,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
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
  // ── B-4: モックナビモーダル ─────────────────────
  navConfirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 9998,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  navConfirmTextWrap: {
    position: 'absolute',
    top: SCREEN_H * 0.25,
    left: SAFE_MARGIN,
    right: SAFE_MARGIN,
    alignItems: 'center',
  },
  mockNavModal: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
  },
  mockNavTitle: { color: '#F2F2F7', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  mockNavSub: { color: '#8E8E93', fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  mockNavOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333333',
  },
  mockNavOptionText: { color: '#F2F2F7', fontSize: 16 },
  mockNavCancel: { marginTop: 12, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#2C2C2E' },
  mockNavCancelText: { color: '#8E8E93', fontSize: 15, fontWeight: '600' },
  // ── C-4b: arrive-result（スポットカード + 気配変更） ──
  arriveResultOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.40)',
    zIndex: 9998,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: SAFE_MARGIN,
  },
  arriveResultCard: {
    marginTop: SCREEN_H * 0.15,
    alignItems: 'center',
    gap: 8,
  },
  // ── モック通知カード ────────────────────────────
  mockNotif: {
    width: '100%',
    backgroundColor: 'rgba(60,60,67,0.9)',
    borderRadius: 16,
    padding: 14,
    marginVertical: 8,
  },
  mockNotifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  mockNotifIcon: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  mockNotifApp: {
    color: '#8E8E93',
    fontSize: 12,
    flex: 1,
  },
  mockNotifTime: {
    color: '#8E8E93',
    fontSize: 12,
  },
  mockNotifTitle: {
    color: '#F2F2F7',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  mockNotifBody: {
    color: '#AEAEB2',
    fontSize: 14,
  },
  // ── モックフッター ─────────────────────────────
  mockFooterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    backgroundColor: 'rgba(28,28,30,0.95)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginVertical: 8,
  },
  mockPlusBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FF6B00',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
});
