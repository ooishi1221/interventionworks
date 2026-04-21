/**
 * TutorialOverlay v5 — セットアップ + 完了画面のみ
 *
 * ガイドツアーの入口（セットアップ: ニックネーム+CC選択）と
 * 出口（完了: あなたの一報がマップに命を灯す）を担当。
 *
 * 中間のインタラクティブステップ（探す・報告・登録）は
 * TutorialGuide + TutorialContext が処理する。
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Dimensions,
  Animated,
  Platform,
  ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { UserCC } from '../types';
import { useTutorial } from '../contexts/TutorialContext';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── CC 選択肢 ──────────────────────────────────────
const CC_OPTIONS: { value: UserCC; label: string; color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { value: 50,   label: '50cc',  color: '#8E8E93', icon: 'moped' },
  { value: 125,  label: '125cc', color: '#30D158', icon: 'scooter' },
  { value: 400,  label: '400cc', color: '#0A84FF', icon: 'motorbike' },
  { value: null,  label: '大型',  color: '#FF9F0A', icon: 'motorbike' },
];

interface Props {
  visible: boolean;
  onFinish: () => void;
  userCC: UserCC;
  onChangeCC: (cc: UserCC) => void;
}

export function TutorialOverlay({ visible, onFinish, userCC, onChangeCC }: Props) {
  const tutorial = useTutorial();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(0)).current;
  // 「はじめる」/「さあはじめよう」ボタンの脈動 — 視線誘導
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const showSetup = visible && tutorial.phase === 'setup';
  const showComplete = visible && tutorial.phase === 'complete';
  const showOverlay = showSetup || showComplete;

  useEffect(() => {
    if (visible && !tutorial.active) {
      // チュートリアル開始
      tutorial.startTutorial();
    }
  }, [visible, tutorial]);

  useEffect(() => {
    if (showOverlay) {
      // complete 画面: TutorialGuide のフェードアウトを待ってから出す。
      // setup 画面: 初回表示なのですぐ。
      const waitForGuideFadeOut = tutorial.phase === 'complete' ? 500 : 0;
      fadeAnim.setValue(0);
      contentFade.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        delay: waitForGuideFadeOut,
        useNativeDriver: true,
      }).start();
      Animated.timing(contentFade, {
        toValue: 1,
        duration: 600,
        delay: waitForGuideFadeOut + 250,
        useNativeDriver: true,
      }).start();

      // CTA ボタンの脈動ループ（コンテンツ表示後にスタート）
      pulseScale.setValue(1);
      const startPulse = setTimeout(() => {
        pulseLoopRef.current = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseScale, { toValue: 1.04, duration: 700, useNativeDriver: true }),
            Animated.timing(pulseScale, { toValue: 1.0,  duration: 700, useNativeDriver: true }),
          ])
        );
        pulseLoopRef.current.start();
      }, waitForGuideFadeOut + 900);
      return () => {
        clearTimeout(startPulse);
        pulseLoopRef.current?.stop();
      };
    }
  }, [showOverlay, tutorial.phase]);

  if (!showOverlay) return null;

  const handleSetupComplete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // フェードアウト→次のステップ（TutorialGuideに引き継ぎ）
    Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
      tutorial.advanceTutorial();
    });
  };

  const handleComplete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
      tutorial.finishTutorial();
      onFinish();
    });
  };

  const selectCC = (cc: UserCC) => {
    onChangeCC(cc);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>

      {/* ── セットアップ画面 ─────────────────────── */}
      {showSetup && (
        <Animated.View style={[styles.fullCenter, { opacity: contentFade }]}>
          <ScrollView
            contentContainerStyle={styles.setupScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <MaterialCommunityIcons name="racing-helmet" size={48} color="#FF9F0A" />
            <View style={{ height: 16 }} />
            <Text style={styles.heroText}>
              ライダーが作る{'\n'}ライダーのための駐輪場マップ。
            </Text>

            <View style={{ height: 28 }} />

            <Text style={styles.ccLabel}>探したい排気量のバイクは？</Text>
            <View style={{ height: 10 }} />
            <View style={styles.ccRow}>
              {CC_OPTIONS.map((opt) => {
                const selected = userCC === opt.value;
                return (
                  <TouchableOpacity
                    key={String(opt.value)}
                    style={[styles.ccChip, selected && { borderColor: opt.color, backgroundColor: `${opt.color}18` }]}
                    onPress={() => selectCC(opt.value)}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name={opt.icon}
                      size={20}
                      color={selected ? opt.color : '#8E8E93'}
                    />
                    <Text style={[styles.ccChipLabel, selected && { color: opt.color, fontWeight: '800' }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ height: 32 }} />

            <Animated.View style={{ transform: [{ scale: pulseScale }] }}>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSetupComplete} activeOpacity={0.8}>
                <Text style={styles.primaryBtnText}>はじめる</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </TouchableOpacity>
            </Animated.View>

            <TouchableOpacity style={styles.skipLink} onPress={handleComplete} activeOpacity={0.7}>
              <Text style={styles.skipText}>スキップ</Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      )}

      {/* ── 完了画面 ─────────────────────────────── */}
      {showComplete && (
        <TouchableWithoutFeedback onPress={handleComplete}>
          <Animated.View style={[styles.fullCenter, { opacity: contentFade }]}>
            <Ionicons name="map" size={48} color="#FF9F0A" />
            <View style={{ height: 20 }} />
            <Text style={styles.heroText}>
              ワンショットを撮るほど{'\n'}地図が育つ。
            </Text>
            <View style={{ height: 48 }} />
            <Animated.View style={[styles.primaryBtnGreen, { transform: [{ scale: pulseScale }] }]}>
              <Text style={styles.primaryBtnText}>さあはじめよう！</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </Animated.View>
          </Animated.View>
        </TouchableWithoutFeedback>
      )}
    </Animated.View>
  );
}

// ─── スタイル ──────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.92)',
    zIndex: 9999,
  },
  fullCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  setupScroll: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 160 : 120,
    paddingBottom: 80,
    paddingHorizontal: 8,
  },
  heroText: { color: '#F2F2F7', fontSize: 22, fontWeight: '700', textAlign: 'center', lineHeight: 34 },
  ccLabel: { color: '#8E8E93', fontSize: 14, fontWeight: '600' },
  ccRow: { flexDirection: 'row', gap: 8 },
  ccChip: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  ccChipLabel: { color: '#8E8E93', fontSize: 12, fontWeight: '600' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#0A84FF',
    paddingVertical: 14, paddingHorizontal: 28,
    borderRadius: 24,
  },
  primaryBtnGreen: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#30D158',
    paddingVertical: 14, paddingHorizontal: 28,
    borderRadius: 24,
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  skipLink: { marginTop: 16, paddingVertical: 8 },
  skipText: { color: '#636366', fontSize: 14 },
});
