/**
 * PhotoPickerSheet — 写真選択ボトムシート
 *
 * カメラ撮影 / フォルダから選択 / キャンセル の3択を
 * 画面下からスライドアップするシートで表示する。
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius } from '../constants/theme';

interface Props {
  visible: boolean;
  onCamera: () => void;
  onLibrary: () => void;
  onCancel: () => void;
}

const ANIM_DURATION = 250;

export function PhotoPickerSheet({ visible, onCamera, onLibrary, onCancel }: Props) {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(0);
    }
  }, [visible, fadeAnim, slideAnim]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onCancel());
  };

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={dismiss}
    >
      {/* オーバーレイ */}
      <TouchableOpacity
        style={s.overlay}
        activeOpacity={1}
        onPress={dismiss}
      >
        <Animated.View style={[s.overlayBg, { opacity: fadeAnim }]} />
      </TouchableOpacity>

      {/* シート */}
      <Animated.View style={[s.sheet, { transform: [{ translateY }] }]}>
        {/* ハンドル */}
        <View style={s.handleRow}>
          <View style={s.handle} />
        </View>

        {/* 撮影する */}
        <TouchableOpacity style={s.row} activeOpacity={0.6} onPress={() => {
          // アニメーション完了を待たずに即実行（カメラ起動の体感速度）
          onCamera();
        }}>
          <Ionicons name="camera" size={22} color={Colors.accent} />
          <Text style={s.rowText}>撮影する</Text>
        </TouchableOpacity>

        <View style={s.separator} />

        {/* フォルダから選択 */}
        <TouchableOpacity style={s.row} activeOpacity={0.6} onPress={() => {
          onLibrary();
        }}>
          <Ionicons name="images" size={22} color={Colors.blue} />
          <Text style={s.rowText}>フォルダから選択</Text>
        </TouchableOpacity>

        <View style={s.separator} />

        {/* キャンセル */}
        <TouchableOpacity style={s.row} activeOpacity={0.6} onPress={dismiss}>
          <Text style={s.cancelText}>キャンセル</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.sheet,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 24,
    gap: 14,
  },
  rowText: {
    fontSize: 16,
    color: Colors.text,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginHorizontal: 24,
  },
  cancelText: {
    fontSize: 16,
    color: Colors.sub,
  },
});
