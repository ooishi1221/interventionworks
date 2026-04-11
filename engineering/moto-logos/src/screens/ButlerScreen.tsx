import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import * as Speech from 'expo-speech';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

interface Props {
  onBack: () => void;
}

const MESSAGES = [
  'いらっしゃいませ。本日もお供いたします。',
  'お近くの駐輪場をお探しでしょうか？',
  '安全運転で、素晴らしい一日をお過ごしください。',
  'ご返却の際は、施錠をお忘れなく。',
  'お帰りなさいませ。今日もお疲れ様でした。',
];

export function ButlerScreen({ onBack }: Props) {
  const [speaking, setSpeaking] = useState(false);
  const [messageIdx, setMessageIdx] = useState(0);

  const handleSpeak = async () => {
    if (speaking) {
      await Speech.stop();
      setSpeaking(false);
      return;
    }
    const text = MESSAGES[messageIdx];
    setSpeaking(true);
    setMessageIdx(i => (i + 1) % MESSAGES.length);
    Speech.speak(text, {
      language: 'ja-JP',
      rate: 0.9,
      onDone: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🗣️ 執事に聞く</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.butlerContainer}>
          <Text style={styles.butlerEmoji}>{speaking ? '🎙️' : '🤵'}</Text>
          <Text style={styles.butlerName}>MotoPark Butler</Text>
          {speaking && <Text style={styles.speakingIndicator}>話し中...</Text>}
        </View>

        <View style={styles.messageCard}>
          <Text style={styles.messageText}>{MESSAGES[messageIdx === 0 ? MESSAGES.length - 1 : messageIdx - 1]}</Text>
        </View>

        <TouchableOpacity
          style={[styles.speakBtn, speaking && styles.speakBtnStop]}
          onPress={handleSpeak}
          activeOpacity={0.8}
        >
          <Text style={styles.speakBtnText}>
            {speaking ? '■　停止する' : '▶　話しかける'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.hint}>タップするたびに執事が次のメッセージを話します</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    minWidth: 60,
  },
  backText: {
    color: Colors.accent,
    fontSize: FontSize.md,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xl,
  },
  butlerContainer: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  butlerEmoji: {
    fontSize: 80,
  },
  butlerName: {
    color: Colors.text,
    fontSize: FontSize.xl,
    fontWeight: 'bold',
  },
  speakingIndicator: {
    color: Colors.accent,
    fontSize: FontSize.sm,
  },
  messageCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  messageText: {
    color: Colors.text,
    fontSize: FontSize.md,
    lineHeight: 24,
    textAlign: 'center',
  },
  speakBtn: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    width: '100%',
    alignItems: 'center',
  },
  speakBtnStop: {
    backgroundColor: Colors.danger,
  },
  speakBtnText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: 'bold',
  },
  hint: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    textAlign: 'center',
  },
});
