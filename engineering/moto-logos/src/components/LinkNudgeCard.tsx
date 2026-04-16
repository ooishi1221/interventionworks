/**
 * LinkNudgeCard — アカウント連携ナッジ
 *
 * 初回足跡後に1回だけ表示される。dismiss可。
 * 「足跡を守る」— 連携すると機種変更しても足跡が消えない。
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, FontSize } from '../constants/theme';
import { useUser } from '../contexts/UserContext';
import { getMyReviewCount } from '../firebase/firestoreService';

const NUDGE_DISMISSED_KEY = 'moto_logos_link_nudge_dismissed';

interface Props {
  onGoToSettings: () => void;
}

export function LinkNudgeCard({ onGoToSettings }: Props) {
  const user = useUser();
  const [visible, setVisible] = useState(false);
  const [slideAnim] = useState(() => new Animated.Value(100));

  useEffect(() => {
    if (!user || user.isLinked) return;

    (async () => {
      const dismissed = await AsyncStorage.getItem(NUDGE_DISMISSED_KEY);
      if (dismissed === 'true') return;

      const count = await getMyReviewCount(user.userId);
      if (count >= 1) {
        setVisible(true);
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }).start();
      }
    })();
  }, [user, slideAnim]);

  const dismiss = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 100,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      AsyncStorage.setItem(NUDGE_DISMISSED_KEY, 'true');
    });
  }, [slideAnim]);

  const handleLink = useCallback(() => {
    dismiss();
    onGoToSettings();
  }, [dismiss, onGoToSettings]);

  if (!visible) return null;

  return (
    <Animated.View style={[s.container, { transform: [{ translateY: slideAnim }] }]}>
      <View style={s.card}>
        <View style={s.iconRow}>
          <Ionicons name="shield-checkmark" size={20} color={Colors.accent} />
          <Text style={s.title}>足跡を守る</Text>
        </View>
        <Text style={s.body}>
          アカウント連携すると、機種変更しても足跡が消えません
        </Text>
        <View style={s.actions}>
          <TouchableOpacity style={s.linkBtn} onPress={handleLink}>
            <Text style={s.linkBtnText}>連携する</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.laterBtn} onPress={dismiss}>
            <Text style={s.laterBtnText}>あとで</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    zIndex: 50,
  },
  card: {
    backgroundColor: Colors.cardElevated,
    borderRadius: 14,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  body: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  linkBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  linkBtnText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  laterBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  laterBtnText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
});
