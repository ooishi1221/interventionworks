/**
 * TutorialOverlay v5 — セットアップ + 完了画面のみ
 *
 * ガイドツアーの入口（セットアップ: ニックネーム+CC選択）と
 * 出口（完了: あなたの一報がマップに命を灯す）を担当。
 *
 * 中間のインタラクティブステップ（探す・報告・登録）は
 * TutorialGuide + TutorialContext が処理する。
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
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
const CC_OPTIONS: { value: UserCC; label: string; color: string; icon: string }[] = [
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
  onSetNickname: (name: string) => void;
}

export function TutorialOverlay({ visible, onFinish, userCC, onChangeCC, onSetNickname }: Props) {
  const tutorial = useTutorial();
  const [nickname, setNickname] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(0)).current;

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
      fadeAnim.setValue(0);
      contentFade.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      Animated.timing(contentFade, { toValue: 1, duration: 500, delay: 200, useNativeDriver: true }).start();
    }
  }, [showOverlay]);

  if (!showOverlay) return null;

  const handleSetupComplete = () => {
    if (nickname.trim()) onSetNickname(nickname.trim());
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

            <TextInput
              style={styles.nicknameInput}
              placeholder="ニックネーム（後から変更可）"
              placeholderTextColor="#636366"
              value={nickname}
              onChangeText={setNickname}
              maxLength={20}
            />

            <View style={{ height: 24 }} />

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
                      name={opt.icon as any}
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

            <TouchableOpacity style={styles.primaryBtn} onPress={handleSetupComplete} activeOpacity={0.8}>
              <Text style={styles.primaryBtnText}>はじめる</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>

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
            <Ionicons name="flame" size={48} color="#FF9F0A" />
            <View style={{ height: 20 }} />
            <Text style={styles.heroText}>
              あなたの一報が{'\n'}マップに命を灯す。
            </Text>
            <View style={{ height: 48 }} />
            <View style={styles.primaryBtnGreen}>
              <Text style={styles.primaryBtnText}>さあ、行こう</Text>
              <Ionicons name="checkmark" size={18} color="#fff" />
            </View>
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
  nicknameInput: {
    width: SCREEN_W * 0.75,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    color: '#F2F2F7',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(10,132,255,0.3)',
  },
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
