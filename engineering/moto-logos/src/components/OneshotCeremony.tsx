/**
 * OneshotCeremony — ワンショット撮影時の「地図に刻む」演出
 *
 * シーケンス:
 *   0ms    白フラッシュ + 大振動
 *   120ms  写真フレームがドロップイン（spring）
 *   350ms  トーストテキストがフェードイン
 *   1800ms 写真が縮小+下に移動（地図に吸い込まれる）+ 背景フェードアウト
 *   2250ms onComplete()
 *
 * タップで即スキップ可能
 */
import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/theme';

const C = Colors;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PHOTO_SIZE = SCREEN_W * 0.75;

interface Props {
  visible: boolean;
  photoUri: string | null;
  spotName: string;
  footprintCount: number;
  onComplete: () => void;
}

export function OneshotCeremony({ visible, photoUri, spotName, footprintCount, onComplete }: Props) {
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const photoScale = useRef(new Animated.Value(0)).current;
  const photoTranslateY = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const dismissing = useRef(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const dismiss = useCallback(() => {
    if (dismissing.current) return;
    dismissing.current = true;
    if (fadeTimer.current) clearTimeout(fadeTimer.current);

    Animated.parallel([
      Animated.timing(photoScale, {
        toValue: 0.12,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(photoTranslateY, {
        toValue: SCREEN_H * 0.3,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(bgOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(textOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onCompleteRef.current();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Animated値はuseRefなので安定。onCompleteはref経由で最新を参照。

  useEffect(() => {
    if (!visible) {
      dismissing.current = false;
      return;
    }

    // Reset
    flashOpacity.setValue(0);
    bgOpacity.setValue(0);
    photoScale.setValue(0);
    photoTranslateY.setValue(0);
    textOpacity.setValue(0);
    dismissing.current = false;

    // Haptic
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Flash: 0 → 1 → 0
    Animated.sequence([
      Animated.timing(flashOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(flashOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();

    // Background fade in
    Animated.timing(bgOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    // Photo drop-in (delayed 120ms)
    const dropTimer = setTimeout(() => {
      Animated.spring(photoScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();
    }, 120);

    // Text fade in (delayed 350ms)
    Animated.timing(textOpacity, {
      toValue: 1,
      duration: 300,
      delay: 350,
      useNativeDriver: true,
    }).start();

    // Auto-dismiss after 1800ms
    fadeTimer.current = setTimeout(dismiss, 1800);

    return () => {
      clearTimeout(dropTimer);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [visible, dismiss]);

  if (!visible || !photoUri) return null;

  const shortName = spotName.replace(/ 付近$/, '');
  const toastParts = ['足跡を刻みました'];
  if (shortName) toastParts.push(shortName);
  if (footprintCount > 0) toastParts.push(`${footprintCount}枚目`);
  const toastText = toastParts.join(' — ');

  return (
    <TouchableWithoutFeedback onPress={dismiss}>
      <View style={styles.container}>
        {/* 半透明黒背景 */}
        <Animated.View style={[styles.backdrop, { opacity: bgOpacity }]} />

        {/* 白フラッシュ */}
        <Animated.View style={[styles.flash, { opacity: flashOpacity }]} />

        {/* 写真フレーム + テキスト */}
        <View style={styles.center}>
          <Animated.View style={[
            styles.photoFrame,
            { transform: [{ scale: photoScale }, { translateY: photoTranslateY }] },
          ]}>
            <Image source={photoUri} style={styles.photo} />
          </Animated.View>
          <Animated.Text style={[styles.toast, { opacity: textOpacity }]}>
            {toastText}
          </Animated.Text>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
  },
  center: {
    alignItems: 'center',
    gap: 20,
  },
  photoFrame: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    // elevation除去（Androidアニメ中に重い）
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  toast: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
