/**
 * InquiryScreen — お問い合わせ/フィードバックフォーム
 * Firestore inquiries コレクションに送信
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db, getFirebaseAuth } from '../firebase/config';
import { useUser } from '../contexts/UserContext';
import { captureError } from '../utils/sentry';
import { Colors } from '../constants/theme';

const C = { ...Colors, card: Colors.cardElevated };

type Category = 'bug' | 'feature' | 'abuse' | 'other';

const CATEGORIES: { id: Category; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'bug',     label: 'バグ報告',     icon: 'bug-outline' },
  { id: 'feature', label: '機能リクエスト', icon: 'bulb-outline' },
  { id: 'abuse',   label: '不正報告',     icon: 'shield-outline' },
  { id: 'other',   label: 'その他',       icon: 'chatbubble-outline' },
];

interface Props {
  onBack: () => void;
}

export function InquiryScreen({ onBack }: Props) {
  const user = useUser();
  const [category, setCategory] = useState<Category | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!category || !message.trim()) {
      Alert.alert('入力エラー', 'カテゴリとメッセージを入力してください');
      return;
    }
    setSending(true);
    const authUser = getFirebaseAuth().currentUser;
    if (!authUser) {
      Alert.alert('認証エラー', 'ログインしていないため送信できません。アプリを再起動してください。');
      setSending(false);
      return;
    }
    try {
      const writePromise = addDoc(collection(db, 'inquiries'), {
        userId: authUser.uid,
        category,
        message: message.trim(),
        status: 'open',
        createdAt: Timestamp.now(),
      });
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore write timeout (10s)')), 10_000),
      );
      await Promise.race([writePromise, timeout]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent(true);
    } catch (e) {
      captureError(e, { context: 'inquiry_send' });
      Alert.alert('送信エラー', 'お問い合わせの送信に失敗しました。ネットワークを確認してください。');
    }
    setSending(false);
  };

  if (sent) {
    return (
      <View style={s.container}>
        <View style={s.sentView}>
          <Ionicons name="checkmark-circle" size={64} color={C.green} />
          <Text style={s.sentTitle}>送信完了</Text>
          <Text style={s.sentBody}>お問い合わせありがとうございます。{'\n'}内容を確認して対応いたします。</Text>
          <TouchableOpacity style={s.sentBtn} onPress={onBack}>
            <Text style={s.sentBtnText}>戻る</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>お問い合わせ</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content}>
          {/* カテゴリ選択 */}
          <Text style={s.label}>カテゴリ</Text>
          <View style={s.categoryGrid}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[s.categoryBtn, category === c.id && s.categoryActive]}
                onPress={() => setCategory(c.id)}
                activeOpacity={0.7}
              >
                <Ionicons name={c.icon} size={20} color={category === c.id ? C.accent : C.sub} />
                <Text style={[s.categoryLabel, category === c.id && { color: C.accent }]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* メッセージ */}
          <Text style={s.label}>メッセージ</Text>
          <TextInput
            style={s.input}
            value={message}
            onChangeText={setMessage}
            placeholder="詳しく教えてください..."
            placeholderTextColor="rgba(255,255,255,0.2)"
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />

          {/* 送信 */}
          <TouchableOpacity
            style={[s.sendBtn, (!category || !message.trim()) && { opacity: 0.4 }]}
            onPress={handleSend}
            disabled={sending || !category || !message.trim()}
          >
            <Text style={s.sendBtnText}>{sending ? '送信中...' : '送信'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingTop: Constants.statusBarHeight },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  backBtn: { width: 32 },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  content: { padding: 16, gap: 16 },
  label: { color: C.text, fontSize: 14, fontWeight: '600' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  categoryActive: { borderColor: C.accent, backgroundColor: 'rgba(255,107,0,0.08)' },
  categoryLabel: { color: C.sub, fontSize: 13, fontWeight: '500' },
  input: { backgroundColor: C.surface, borderRadius: 12, padding: 14, color: C.text, fontSize: 15, minHeight: 140, borderWidth: 1, borderColor: C.border },
  sendBtn: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center', minHeight: 52 },
  sendBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  sentView: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  sentTitle: { color: C.text, fontSize: 22, fontWeight: '800' },
  sentBody: { color: C.sub, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  sentBtn: { backgroundColor: C.surface, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, marginTop: 8 },
  sentBtnText: { color: C.text, fontSize: 15, fontWeight: '600' },
});
