/**
 * ReportModal — ワンショット通報モーダル
 *
 * Apple App Store Guideline 1.2（UGC Objectionable Content）準拠。
 * 各ワンショットの 🚩 アイコンから起動され、理由選択 + 自由記述 + 送信で
 * Firestore `reports` コレクションに書き込む。Slack Bot が監視して通知。
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db, getFirebaseAuth } from '../firebase/config';
import { captureError } from '../utils/sentry';
import { Colors } from '../constants/theme';
import type { ReportReason } from '../firebase/firestoreTypes';
import { useUserBlocks } from '../contexts/UserBlocksContext';

const C = Colors;

type Props = {
  visible: boolean;
  onClose: () => void;
  targetReviewId: string;
  targetUserId: string;
  spotId: string;
};

const REASONS: { type: ReportReason; icon: keyof typeof Ionicons.glyphMap; label: string; desc: string }[] = [
  { type: 'inappropriate', icon: 'warning', label: '公序良俗違反', desc: 'ヌード / 暴力 / 違法行為' },
  { type: 'spam', icon: 'megaphone', label: 'スパム', desc: '宣伝 / 繰り返し投稿' },
  { type: 'other', icon: 'ellipsis-horizontal-circle', label: 'その他', desc: '上記以外' },
];

export function ReportModal({ visible, onClose, targetReviewId, targetUserId, spotId }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true); // デフォルトON（Apple UX定番）
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const { blockUser } = useUserBlocks();

  const reset = useCallback(() => {
    setReason(null);
    setNote('');
    setAlsoBlock(true);
    setSending(false);
    setSent(false);
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    setTimeout(reset, 300);
  }, [onClose, reset]);

  const handleSend = useCallback(async () => {
    if (!reason) return;
    const authUser = getFirebaseAuth().currentUser;
    if (!authUser) {
      Alert.alert('認証エラー', 'ログインしていないため通報できません。アプリを再起動してください。');
      return;
    }
    setSending(true);

    try {
      await addDoc(collection(db, 'reports'), {
        reviewId: targetReviewId,
        spotId,
        reporterUid: authUser.uid,
        reason,
        description: note.trim() || null,
        status: 'open',
        createdAt: Timestamp.now(),
        // Phase 2 ブロック機能 + Slack 通知用のデノーマライズ（Admin 側は reviews を JOIN）
        targetUserId,
      });

      // ブロック併設（失敗しても通報は完了扱い）
      if (alsoBlock && targetUserId) {
        try {
          await blockUser(targetUserId);
        } catch (e) {
          captureError(e, { context: 'report_also_block' });
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSending(false);
      setSent(true);
      setTimeout(handleClose, 1500);
    } catch (e) {
      setSending(false);
      captureError(e, { context: 'report_submit' });
      Alert.alert('送信に失敗しました', 'ネットワークを確認してもう一度お試しください');
    }
  }, [reason, note, targetReviewId, targetUserId, spotId, alsoBlock, blockUser, handleClose]);

  const canSend = reason !== null && !sending;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={handleClose} />

        <View style={s.sheet}>
          {sent ? (
            <View style={s.sentView}>
              <Ionicons name="checkmark-circle" size={48} color={C.success} />
              <Text style={s.sentTitle}>通報しました</Text>
              <Text style={s.sentSub}>24時間以内に確認します</Text>
            </View>
          ) : (
            <>
              <View style={s.header}>
                <Text style={s.title}>通報</Text>
                <TouchableOpacity onPress={handleClose} style={s.closeBtn}>
                  <Ionicons name="close" size={22} color={C.sub} />
                </TouchableOpacity>
              </View>

              <Text style={s.subtitle}>理由を選んでください</Text>

              <View style={s.reasonList}>
                {REASONS.map((r) => {
                  const active = reason === r.type;
                  return (
                    <TouchableOpacity
                      key={r.type}
                      style={[s.reasonRow, active && s.reasonActive]}
                      onPress={() => {
                        setReason(r.type);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={r.icon}
                        size={20}
                        color={active ? C.accent : C.sub}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.reasonLabel, active && s.reasonLabelActive]}>{r.label}</Text>
                        <Text style={s.reasonDesc}>{r.desc}</Text>
                      </View>
                      {active && <Ionicons name="checkmark-circle" size={20} color={C.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={s.inputWrap}>
                <TextInput
                  style={s.input}
                  placeholder="補足（任意）"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  value={note}
                  onChangeText={setNote}
                  multiline
                  maxLength={300}
                  textAlignVertical="top"
                  returnKeyType="done"
                  blurOnSubmit
                />
                <TouchableOpacity
                  onPress={Keyboard.dismiss}
                  style={s.kbDoneBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="キーボードを閉じる"
                >
                  <Ionicons name="chevron-down" size={18} color={C.sub} />
                </TouchableOpacity>
              </View>

              {targetUserId ? (
                <TouchableOpacity
                  style={s.blockRow}
                  onPress={() => {
                    setAlsoBlock((v) => !v);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: alsoBlock }}
                >
                  <Ionicons
                    name={alsoBlock ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={alsoBlock ? C.accent : C.sub}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={s.blockLabel}>このライダーをブロック</Text>
                    <Text style={s.blockDesc}>今後このライダーの投稿を表示しません</Text>
                  </View>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[s.sendBtn, !canSend && s.sendBtnDisabled]}
                onPress={() => {
                  Keyboard.dismiss();
                  handleSend();
                }}
                disabled={!canSend}
                activeOpacity={0.8}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.sendText}>通報する</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { color: C.text, fontSize: 18, fontWeight: '700' },
  subtitle: { color: C.sub, fontSize: 13, marginBottom: 14 },
  closeBtn: { padding: 4 },

  reasonList: { gap: 8, marginBottom: 14 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 52,
  },
  reasonActive: { borderColor: C.accent, backgroundColor: `${C.accent}15` },
  reasonLabel: { color: C.text, fontSize: 15, fontWeight: '600' },
  reasonLabelActive: { color: C.accent },
  reasonDesc: { color: C.sub, fontSize: 12, marginTop: 2 },

  inputWrap: { position: 'relative', marginBottom: 14 },
  input: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    paddingRight: 40,
    color: C.text,
    fontSize: 14,
    minHeight: 80,
    borderWidth: 1,
    borderColor: C.border,
  },
  kbDoneBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 14,
    minHeight: 52,
  },
  blockLabel: { color: C.text, fontSize: 14, fontWeight: '600' },
  blockDesc: { color: C.sub, fontSize: 12, marginTop: 2 },

  sendBtn: {
    backgroundColor: C.danger,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  sentView: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 8 },
  sentTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  sentSub: { color: C.sub, fontSize: 14 },
});
