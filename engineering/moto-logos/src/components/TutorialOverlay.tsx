/**
 * TutorialOverlay v2 — Anna x Andy 協議版
 *
 * 原則: 「読ませる」のではなく「感じさせる」
 * 3+1ステップ: ウェルカム → CC実選択 → ラジアル指アニメ → 完了
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { UserCC } from '../types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export interface SpotlightRect {
  x: number; y: number; w: number; h: number; borderRadius?: number;
}

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
  targets: Record<string, SpotlightRect>;
  userCC: UserCC;
  onChangeCC: (cc: UserCC) => void;
  onSetNickname: (name: string) => void;
}

export function TutorialOverlay({ visible, onFinish, targets, userCC, onChangeCC, onSetNickname }: Props) {
  const [step, setStep] = useState(0);
  const [nickname, setNickname] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(0)).current;

  // 指アニメーション用
  const fingerX = useRef(new Animated.Value(0)).current;
  const fingerY = useRef(new Animated.Value(0)).current;
  const fingerOpacity = useRef(new Animated.Value(0)).current;
  const fanOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setStep(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      Animated.timing(contentFade, { toValue: 1, duration: 600, delay: 300, useNativeDriver: true }).start();
    }
  }, [visible]);

  // Step 2: 指アニメーション
  useEffect(() => {
    if (step !== 3) return;
    const runAnim = () => {
      // リセット
      fingerX.setValue(0);
      fingerY.setValue(0);
      fingerOpacity.setValue(0);
      fanOpacity.setValue(0);

      Animated.sequence([
        // 1. 指が現れる
        Animated.timing(fingerOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        // 2. 長押し（待機）
        Animated.delay(600),
        // 3. メニューが展開
        Animated.timing(fanOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        // 4. 指がスライド（左上へ）
        Animated.parallel([
          Animated.timing(fingerX, { toValue: -60, duration: 500, useNativeDriver: true }),
          Animated.timing(fingerY, { toValue: -50, duration: 500, useNativeDriver: true }),
        ]),
        // 5. 少し待って離す
        Animated.delay(400),
        // 6. 全部フェードアウト
        Animated.parallel([
          Animated.timing(fingerOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.timing(fanOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
        Animated.delay(500),
      ]).start(() => {
        if (step === 3) runAnim(); // ループ
      });
    };
    runAnim();
  }, [step]);

  if (!visible) return null;

  const LAST_STEP = 4;
  const isLast = step === LAST_STEP;

  const goNext = () => {
    if (step === 1) {
      // ニックネーム保存
      if (nickname.trim()) onSetNickname(nickname.trim());
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (step === 2) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Animated.timing(contentFade, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      if (isLast) {
        Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(onFinish);
      } else {
        setStep((s) => s + 1);
        Animated.timing(contentFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      }
    });
  };

  const selectCC = (cc: UserCC) => {
    onChangeCC(cc);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>

      {/* ── Step 0: ウェルカム ─────────────────────── */}
      {step === 0 && (
        <Animated.View style={[styles.fullCenter, { opacity: contentFade }]}>
          <MaterialCommunityIcons name="motorbike" size={48} color="#FF9F0A" />
          <Text style={styles.brand}>Moto-Logos</Text>
          <Text style={styles.brandSub}>RIDERS' COLLECTIVE MAP</Text>
          <View style={{ height: 32 }} />
          <Text style={styles.heroText}>
            一人の発見を、{'\n'}全ライダーの安心に。
          </Text>
          <View style={{ height: 48 }} />
          <TouchableOpacity style={styles.primaryBtn} onPress={goNext} activeOpacity={0.8}>
            <Text style={styles.primaryBtnText}>はじめる</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Step 1: ニックネーム ────────────────────── */}
      {step === 1 && (
        <Animated.View style={[styles.fullCenter, { opacity: contentFade }]}>
          <Ionicons name="person-circle-outline" size={48} color="#0A84FF" />
          <View style={{ height: 16 }} />
          <Text style={styles.stepQuestion}>あなたのニックネームは？</Text>
          <Text style={[styles.stepHint, { marginTop: 6 }]}>口コミやレポートに表示されます</Text>
          <View style={{ height: 24 }} />
          <TextInput
            style={styles.nicknameInput}
            placeholder="例: ツーリングライダー"
            placeholderTextColor="#636366"
            value={nickname}
            onChangeText={setNickname}
            maxLength={20}
            autoFocus
          />
          <View style={{ height: 32 }} />
          <TouchableOpacity style={styles.primaryBtn} onPress={goNext} activeOpacity={0.8}>
            <Text style={styles.primaryBtnText}>{nickname.trim() ? '次へ' : 'スキップ'}</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Step 2: CC 実選択 ─────────────────────── */}
      {step === 2 && (
        <Animated.View style={[styles.fullCenter, { opacity: contentFade }]}>
          <Text style={styles.stepQuestion}>あなたのバイクは？</Text>
          <View style={{ height: 24 }} />
          <View style={styles.ccGrid}>
            {CC_OPTIONS.map((opt) => {
              const selected = userCC === opt.value;
              return (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={[styles.ccCard, selected && { borderColor: opt.color, backgroundColor: `${opt.color}18` }]}
                  onPress={() => selectCC(opt.value)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name={opt.icon as any}
                    size={28}
                    color={selected ? opt.color : '#8E8E93'}
                  />
                  <Text style={[styles.ccCardLabel, selected && { color: opt.color, fontWeight: '800' }]}>
                    {opt.label}
                  </Text>
                  {selected && <Ionicons name="checkmark-circle" size={18} color={opt.color} />}
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ height: 32 }} />
          <TouchableOpacity style={styles.primaryBtn} onPress={goNext} activeOpacity={0.8}>
            <Text style={styles.primaryBtnText}>次へ</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Step 3: FAB + ラジアル指アニメ ──────────── */}
      {step === 3 && (
        <Animated.View style={[styles.fullCenter, { opacity: contentFade }]}>
          <Text style={styles.stepQuestion}>2つのボタンを使いこなそう</Text>
          <Text style={styles.stepHint}>スポット登録は「＋」、地図操作は長押しメニュー</Text>
          <View style={{ height: 24 }} />

          {/* アニメーションエリア */}
          <View style={styles.demoArea}>
            {/* 扇形メニュー（4項目: 登録はFABに移動済み） */}
            <Animated.View style={[styles.demoFan, { opacity: fanOpacity }]}>
              {['現在地', '最寄り', '更新', '検索'].map((label, i) => (
                <View key={label} style={[styles.demoFanItem, {
                  transform: [
                    { translateX: -55 - i * 10 },
                    { translateY: -30 - i * 24 },
                  ],
                }]}>
                  <View style={styles.demoFanDot} />
                  <Text style={styles.demoFanLabel}>{label}</Text>
                </View>
              ))}
            </Animated.View>

            {/* トリガーボタン（ラジアル） */}
            <View style={styles.demoTrigger}>
              <Ionicons name="options-outline" size={22} color="#E5E5EA" />
            </View>

            {/* FAB「+」ボタン */}
            <View style={styles.demoFab}>
              <Ionicons name="add" size={28} color="#fff" />
            </View>
            <Text style={styles.demoFabLabel}>スポット登録</Text>

            {/* 指アイコン */}
            <Animated.View style={[styles.finger, {
              opacity: fingerOpacity,
              transform: [{ translateX: fingerX }, { translateY: fingerY }],
            }]}>
              <Ionicons name="finger-print" size={36} color="rgba(255,255,255,0.7)" />
            </Animated.View>
          </View>

          <View style={{ height: 32 }} />
          <TouchableOpacity style={styles.primaryBtn} onPress={goNext} activeOpacity={0.8}>
            <Text style={styles.primaryBtnText}>わかった</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipLink} onPress={onFinish}>
            <Text style={styles.skipText}>スキップ</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Step 4: 完了 ─────────────────────────── */}
      {step === 4 && (
        <Animated.View style={[styles.fullCenter, { opacity: contentFade }]}>
          <MaterialCommunityIcons name="motorbike" size={40} color="#30D158" />
          <View style={{ height: 16 }} />
          <Text style={styles.heroText}>走るたびに、地図が育つ。</Text>
          <View style={{ height: 48 }} />
          <TouchableOpacity style={styles.primaryBtnGreen} onPress={goNext} activeOpacity={0.8}>
            <Text style={styles.primaryBtnText}>さあ、行こう</Text>
            <Ionicons name="checkmark" size={18} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── ドットインジケーター ──────────────────── */}
      <View style={styles.dots}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>
    </Animated.View>
  );
}

// ─── スタイル ────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.88)',
    zIndex: 9999,
  },

  fullCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },

  // ブランド
  brand: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -1, marginTop: 12 },
  brandSub: { color: '#636366', fontSize: 11, letterSpacing: 3, marginTop: 4 },
  heroText: { color: '#F2F2F7', fontSize: 20, fontWeight: '700', textAlign: 'center', lineHeight: 32 },

  // ステップ
  stepQuestion: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  stepHint: { color: '#8E8E93', fontSize: 14, marginTop: 6, textAlign: 'center' },
  nicknameInput: {
    width: '80%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    color: '#F2F2F7',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(10,132,255,0.3)',
  },

  // CC グリッド
  ccGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  ccCard: {
    width: SCREEN_W * 0.38,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  ccCardLabel: { color: '#8E8E93', fontSize: 15, fontWeight: '600' },

  // ラジアルデモ
  demoArea: {
    width: 200, height: 200,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  demoTrigger: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(28,28,30,0.95)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  demoFan: { position: 'absolute', bottom: 26, right: 26 },
  demoFanItem: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  demoFanDot: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(28,28,30,0.95)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  demoFanLabel: { color: '#ccc', fontSize: 10, fontWeight: '600' },
  demoFab: {
    position: 'absolute',
    bottom: 70, right: 0,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#FF6B00',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF6B00', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 6,
  },
  demoFabLabel: {
    position: 'absolute',
    bottom: 76, right: 58,
    color: '#FF6B00', fontSize: 10, fontWeight: '700',
  },
  finger: {
    position: 'absolute',
    bottom: 0, right: 8,
  },

  // ボタン
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

  // ドット
  dots: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 50 : 30,
    left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: {
    width: 20,
    backgroundColor: '#0A84FF',
  },
});
