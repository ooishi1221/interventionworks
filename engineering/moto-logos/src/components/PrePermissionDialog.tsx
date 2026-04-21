/**
 * PrePermissionDialog — システムダイアログ前のソフト説明カード
 *
 * iOS/Android のシステム権限ダイアログは1回拒否されると再表示が困難。
 * その前にブランドに沿った文脈説明を1枚挟み、許可率を上げる。
 */
import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

const C = Colors;

export type PromptType = 'notification' | 'location';

interface CopyEntry {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  allow: string;
}

const COPY: Record<PromptType, CopyEntry> = {
  notification: {
    icon: 'notifications-outline',
    title: '通知をオンにする？',
    body: '新しい機能のお知らせや、近くのスポットの「気配」を逃さずチェックできます。',
    allow: '通知を許可',
  },
  location: {
    icon: 'location-outline',
    title: '位置情報を使わせて',
    body: '現在地の周りに残された気配を表示するために使います。マップ表示と検索のためだけに利用します。',
    allow: '位置情報を許可',
  },
};

interface Props {
  visible: boolean;
  type: PromptType;
  onAllow: () => void;
  onDeny: () => void;
}

export function PrePermissionDialog({ visible, type, onAllow, onDeny }: Props) {
  const copy = COPY[type];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDeny}>
      <TouchableWithoutFeedback onPress={onDeny}>
        <View style={s.backdrop}>
          <TouchableWithoutFeedback>
            <View style={s.card}>
              <View style={s.iconWrap}>
                <Ionicons name={copy.icon} size={36} color="#FF6B00" />
              </View>
              <Text style={s.title}>{copy.title}</Text>
              <Text style={s.body}>{copy.body}</Text>
              <TouchableOpacity style={s.allowBtn} onPress={onAllow} activeOpacity={0.85}>
                <Text style={s.allowText}>{copy.allow}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.denyBtn} onPress={onDeny} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.denyText}>あとで</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1C1C1E',
    borderRadius: 22,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 18,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 24,
      },
      android: { elevation: 16 },
    }),
  },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,107,0,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    color: C.text,
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 10,
  },
  body: {
    color: C.sub,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 22,
  },
  allowBtn: {
    width: '100%',
    backgroundColor: '#FF6B00',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  allowText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  denyBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  denyText: { color: C.sub, fontSize: 14, fontWeight: '500' },
});
