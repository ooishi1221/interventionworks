/**
 * BetaFeedbackButton — β期間限定フィードバックボタン
 *
 * フローティングボタン → モーダル → カテゴリ選択 + テキスト + 任意写真 → Firestore → Slack通知
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
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useUser } from '../contexts/UserContext';
import { pickPhotoFromCamera, pickPhotoFromLibrary } from '../utils/photoPicker';
import { uploadReviewPhoto } from '../utils/image-upload';
import { captureError } from '../utils/sentry';
import { Colors } from '../constants/theme';

const C = Colors;

type FeedbackType = 'bug' | 'opinion' | 'confused';

const CATEGORIES: { type: FeedbackType; icon: string; label: string }[] = [
  { type: 'bug', icon: 'bug', label: 'バグ' },
  { type: 'opinion', icon: 'bulb', label: '意見' },
  { type: 'confused', icon: 'help-circle', label: 'わからない' },
];

const TAB_BAR_H = Platform.OS === 'android' ? 56 : 82;
const BOTTOM_BASE = TAB_BAR_H + 2;

export function BetaFeedbackButton() {
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType | null>(null);
  const [message, setMessage] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const reset = useCallback(() => {
    setFeedbackType(null);
    setMessage('');
    setPhotoUri(null);
    setSending(false);
    setSent(false);
  }, []);

  const handleOpen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    // 少し遅延してリセット（閉じアニメ中に見えないように）
    setTimeout(reset, 300);
  }, [reset]);

  const handlePickCamera = useCallback(async () => {
    const uri = await pickPhotoFromCamera();
    if (uri) setPhotoUri(uri);
  }, []);

  const handlePickAlbum = useCallback(async () => {
    const uri = await pickPhotoFromLibrary();
    if (uri) setPhotoUri(uri);
  }, []);

  const handleSend = useCallback(async () => {
    if (!feedbackType || !message.trim()) return;
    setSending(true);

    try {
      let photoUrl: string | undefined;
      if (photoUri && user?.userId) {
        try {
          photoUrl = await uploadReviewPhoto(photoUri, user.userId, 'feedback');
        } catch (e) {
          captureError(e, { context: 'beta_feedback_photo' });
        }
      }

      await addDoc(collection(db, 'beta_feedback'), {
        userId: user?.userId || 'unknown',
        feedbackType,
        message: message.trim(),
        photoUrl: photoUrl ?? null,
        os: Platform.OS,
        deviceModel: Device.modelName ?? 'unknown',
        deviceBrand: Device.brand ?? 'unknown',
        osVersion: Device.osVersion ?? 'unknown',
        appVersion: Constants.expoConfig?.version ?? 'unknown',
        createdAt: Timestamp.now(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent(true);
      setTimeout(handleClose, 1200);
    } catch (e) {
      captureError(e, { context: 'beta_feedback_send' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setSending(false);
  }, [feedbackType, message, photoUri, user, handleClose]);

  const canSend = feedbackType && message.trim().length > 0 && !sending;

  return (
    <>
      {/* ── フローティングボタン ──────────────────────── */}
      <TouchableOpacity
        style={s.fab}
        onPress={handleOpen}
        activeOpacity={0.8}
        accessibilityLabel="フィードバックを送る"
        accessibilityRole="button"
      >
        <Ionicons name="chatbubble-ellipses" size={20} color="#F2F2F7" />
      </TouchableOpacity>

      {/* ── モーダル ──────────────────────────────────── */}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
      >
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={handleClose} />

          <View style={s.sheet}>
            {sent ? (
              /* ── 送信完了 ─────────────────────────── */
              <View style={s.sentView}>
                <Ionicons name="checkmark-circle" size={48} color={C.success} />
                <Text style={s.sentText}>ありがとう!</Text>
              </View>
            ) : (
              /* ── フォーム ──────────────────────────── */
              <>
                {/* ヘッダー */}
                <View style={s.header}>
                  <Text style={s.title}>フィードバック</Text>
                  <TouchableOpacity onPress={handleClose} style={s.closeBtn}>
                    <Ionicons name="close" size={22} color={C.sub} />
                  </TouchableOpacity>
                </View>

                {/* カテゴリ */}
                <View style={s.categoryRow}>
                  {CATEGORIES.map((cat) => {
                    const active = feedbackType === cat.type;
                    return (
                      <TouchableOpacity
                        key={cat.type}
                        style={[s.categoryChip, active && s.categoryActive]}
                        onPress={() => { setFeedbackType(cat.type); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={cat.icon as keyof typeof Ionicons.glyphMap}
                          size={18}
                          color={active ? C.accent : C.sub}
                        />
                        <Text style={[s.categoryText, active && s.categoryTextActive]}>{cat.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* テキスト入力 */}
                <TextInput
                  style={s.input}
                  placeholder="どんなことでも教えてください"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  maxLength={500}
                  textAlignVertical="top"
                />

                {/* 写真 */}
                {photoUri ? (
                  <View style={s.photoRow}>
                    <Image source={{ uri: photoUri }} style={s.photoThumb} />
                    <TouchableOpacity onPress={() => setPhotoUri(null)} style={s.photoRemove}>
                      <Ionicons name="close-circle" size={22} color={C.danger} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={s.photoActions}>
                    <TouchableOpacity style={s.photoBtn} onPress={handlePickCamera}>
                      <Ionicons name="camera-outline" size={18} color={C.sub} />
                      <Text style={s.photoBtnText}>撮影</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.photoBtn} onPress={handlePickAlbum}>
                      <Ionicons name="image-outline" size={18} color={C.sub} />
                      <Text style={s.photoBtnText}>アルバム</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* 送信 */}
                <TouchableOpacity
                  style={[s.sendBtn, !canSend && s.sendBtnDisabled]}
                  onPress={handleSend}
                  disabled={!canSend}
                  activeOpacity={0.8}
                >
                  {sending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={s.sendText}>送信する</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  // ── FAB ────────────────────────────────────
  fab: {
    position: 'absolute',
    right: 14,
    bottom: BOTTOM_BASE + 72,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,28,30,0.88)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 5,
  },

  // ── Modal ──────────────────────────────────
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '80%',
  },

  // ── Header ─────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: { padding: 4 },

  // ── Category ───────────────────────────────
  categoryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  categoryChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  categoryActive: {
    borderColor: C.accent,
    backgroundColor: `${C.accent}15`,
  },
  categoryText: {
    color: C.sub,
    fontSize: 14,
    fontWeight: '600',
  },
  categoryTextActive: {
    color: C.accent,
  },

  // ── Input ──────────────────────────────────
  input: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    color: C.text,
    fontSize: 15,
    minHeight: 100,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 12,
  },

  // ── Photo ──────────────────────────────────
  photoActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  photoBtnText: {
    color: C.sub,
    fontSize: 13,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  photoThumb: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
  photoRemove: { padding: 4 },

  // ── Send ───────────────────────────────────
  sendBtn: {
    backgroundColor: C.accent,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // ── Sent ───────────────────────────────────
  sentView: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  sentText: {
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
  },
});
