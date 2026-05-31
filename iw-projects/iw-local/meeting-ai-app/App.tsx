import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import {
  useAudioRecorder,
  setAudioModeAsync,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
} from "expo-audio";
import type { RecordingOptions } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";

// ──────────────────────────────────────────
// Constants
// ──────────────────────────────────────────
const DEFAULT_WHISPER_URL = "http://100.86.242.55:8767";
const STORAGE_KEY_URL = "@meeting_ai_whisper_url";
const CHUNK_DURATION_MS = 20000;
const RECORDING_OPTIONS: RecordingOptions = RecordingPresets.HIGH_QUALITY;
const NOISE_PATTERNS = [
  "ご視聴ありがとう",
  "日本語の会議",
  "次回予告",
  "チャンネル登録",
  "字幕",
];

function getTimestamp() {
  return new Date().toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function isNoise(text: string): boolean {
  return NOISE_PATTERNS.some((p) => text.includes(p));
}

// ──────────────────────────────────────────
// Types
// ──────────────────────────────────────────
interface TranscriptEntry {
  id: string;
  timestamp: string;
  text: string;
}

type Screen = "main" | "settings";

// ──────────────────────────────────────────
// App
// ──────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState<Screen>("main");
  const [whisperUrl, setWhisperUrl] = useState(DEFAULT_WHISPER_URL);
  const [urlInput, setUrlInput] = useState(DEFAULT_WHISPER_URL);
  const [isRecording, setIsRecording] = useState(false);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // useAudioRecorder はフックなのでトップレベルで呼ぶ
  const recorder = useAudioRecorder(RECORDING_OPTIONS);

  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRecordingRef = useRef(false);
  const isSendingRef = useRef(false);
  const pendingChunksRef = useRef<string[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  // ── URL 読み込み ──
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_URL).then((val) => {
      if (val) {
        setWhisperUrl(val);
        setUrlInput(val);
      }
    });
  }, []);

  // ── スクロール最下部 ──
  useEffect(() => {
    if (entries.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [entries]);

  // ── チャンク送信（キュー方式: 1件ずつ順番に処理） ──
  const processQueue = useCallback(async (): Promise<void> => {
    if (isSendingRef.current) return;
    const uri = pendingChunksRef.current.shift();
    if (!uri) return;

    isSendingRef.current = true;
    setSending(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const res = await fetch(`${whisperUrl}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: base64, mimeType: "audio/m4a" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { text } = (await res.json()) as { text?: string };
      setError(null);
      if (text && text.trim().length > 0 && !isNoise(text.trim())) {
        setEntries((prev) => [...prev, {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          timestamp: getTimestamp(),
          text: text.trim(),
        }]);
      }
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch (err) {
      console.error("sendChunk error:", err);
      setError(`送信失敗: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      isSendingRef.current = false;
      setSending(false);
      if (pendingChunksRef.current.length > 0) processQueue();
    }
  }, [whisperUrl]);

  const sendChunk = useCallback((uri: string) => {
    pendingChunksRef.current.push(uri);
    processQueue();
  }, [processQueue]);

  // ── 1チャンク録音 → 送信 → ループ ──
  const recordChunk = useCallback(async (): Promise<void> => {
    if (!isRecordingRef.current) return;

    try {
      await recorder.prepareToRecordAsync();
      recorder.record();

      chunkTimerRef.current = setTimeout(async () => {
        if (!isRecordingRef.current) return;
        try {
          await recorder.stop();
          const uri = recorder.uri;
          if (uri) {
            // ファイルを安全な場所にコピーしてからキューに入れる
            const destUri = `${FileSystem.cacheDirectory}chunk_${Date.now()}.m4a`;
            await FileSystem.copyAsync({ from: uri, to: destUri });
            sendChunk(destUri);
          }
        } catch (e) {
          console.warn("chunk stop error:", e);
        }
        // 次チャンク
        recordChunk();
      }, CHUNK_DURATION_MS);
    } catch (e) {
      console.error("recordChunk error:", e);
      if (isRecordingRef.current) {
        setError("録音エラーが発生しました");
        setIsRecording(false);
        isRecordingRef.current = false;
      }
    }
  }, [recorder, sendChunk]);

  // ── 録音開始 ──
  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const existingPermission = await getRecordingPermissionsAsync();
      const { granted } = existingPermission.granted
        ? existingPermission
        : await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert("マイク許可が必要です", "設定からマイクへのアクセスを許可してください。");
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        allowsBackgroundRecording: true,
        shouldPlayInBackground: true,
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
      });

      isRecordingRef.current = true;
      setIsRecording(true);
      await recordChunk();
    } catch (e) {
      console.error("startRecording error:", e);
      Alert.alert("エラー", "録音を開始できませんでした。");
      isRecordingRef.current = false;
      setIsRecording(false);
    }
  }, [recordChunk]);

  // ── 録音停止 ──
  const stopRecording = useCallback(async () => {
    isRecordingRef.current = false;
    setIsRecording(false);

    if (chunkTimerRef.current) {
      clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }

    try {
      if (recorder.isRecording) {
        await recorder.stop();
        const uri = recorder.uri;
        if (uri) sendChunk(uri);
      }
    } catch (e) {
      console.warn("stopRecording error:", e);
    }

    await setAudioModeAsync({
      allowsRecording: false,
      allowsBackgroundRecording: false,
      shouldPlayInBackground: false,
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
    });
  }, [recorder, sendChunk]);

  // ── クリーンアップ ──
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
      if (recorder.isRecording) {
        recorder.stop().catch(() => {});
      }
    };
  }, [recorder]);

  // ── ノイズ除去 ──
  const removeNoise = useCallback(() => {
    setEntries((prev) => prev.filter((e) => !isNoise(e.text)));
  }, []);

  // ── 設定保存 ──
  const saveSettings = useCallback(async () => {
    const url = urlInput.trim().replace(/\/$/, "");
    await AsyncStorage.setItem(STORAGE_KEY_URL, url);
    setWhisperUrl(url);
    setScreen("main");
  }, [urlInput]);

  // ──────────────────────────────────────────
  // 設定画面
  // ──────────────────────────────────────────
  if (screen === "settings") {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.settingsWrap}>
            <Text style={styles.settingsTitle}>接続設定</Text>

            <Text style={styles.label}>Whisper サーバー URL</Text>
            <TextInput
              style={styles.input}
              value={urlInput}
              onChangeText={setUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="http://100.86.242.55:8767"
              placeholderTextColor="#52525b"
            />
            <Text style={styles.hint}>
              Mac mini の Tailscale IP を入力（末尾スラッシュ不要）
            </Text>

            <TouchableOpacity style={styles.saveBtn} onPress={saveSettings}>
              <Text style={styles.saveBtnText}>保存して戻る</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setScreen("main")}
            >
              <Text style={styles.cancelBtnText}>キャンセル</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ──────────────────────────────────────────
  // メイン画面
  // ──────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>meeting-ai</Text>
        <View style={styles.headerRight}>
          {sending && (
            <ActivityIndicator size="small" color="#60a5fa" style={{ marginRight: 8 }} />
          )}
          <TouchableOpacity onPress={() => setScreen("settings")} style={styles.settingsIcon}>
            <Text style={styles.settingsIconText}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* エラー */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Text style={styles.errorDismiss}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 文字起こしリスト */}
      <ScrollView
        ref={scrollRef}
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
      >
        {entries.length === 0 ? (
          <Text style={styles.emptyText}>
            {isRecording
              ? "聴き取り中..."
              : "録音ボタンを押すと文字起こしが始まります"}
          </Text>
        ) : (
          entries.map((e) => (
            <View key={e.id} style={styles.entry}>
              <Text style={styles.entryTime}>{e.timestamp}</Text>
              <Text style={styles.entryText}>{e.text}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* フッター */}
      <View style={styles.footer}>
        {/* ノイズ除去 */}
        <TouchableOpacity
          style={styles.footerBtn}
          onPress={removeNoise}
          disabled={entries.length === 0}
        >
          <Text style={[styles.footerBtnText, entries.length === 0 && { opacity: 0.3 }]}>
            🧹 ノイズ除去
          </Text>
        </TouchableOpacity>

        {/* 録音ボタン */}
        <TouchableOpacity
          style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
          onPress={isRecording ? stopRecording : startRecording}
          activeOpacity={0.8}
        >
          {isRecording ? (
            <>
              <View style={styles.stopIcon} />
              <Text style={styles.recordBtnText}>停止</Text>
            </>
          ) : (
            <>
              <View style={styles.recDot} />
              <Text style={styles.recordBtnText}>録音開始</Text>
            </>
          )}
        </TouchableOpacity>

        {/* クリア */}
        <TouchableOpacity
          style={styles.footerBtn}
          onPress={() => {
            if (entries.length === 0) return;
            Alert.alert("クリア", "文字起こしをすべて削除しますか？", [
              { text: "キャンセル", style: "cancel" },
              { text: "削除", style: "destructive", onPress: () => setEntries([]) },
            ]);
          }}
          disabled={entries.length === 0}
        >
          <Text style={[styles.footerBtnText, entries.length === 0 && { opacity: 0.3 }]}>
            🗑 クリア
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ──────────────────────────────────────────
// Styles
// ──────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#27272a",
  },
  headerTitle: {
    color: "#f4f4f5",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  settingsIcon: {
    padding: 4,
  },
  settingsIconText: {
    color: "#71717a",
    fontSize: 20,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#7f1d1d",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 13,
    flex: 1,
  },
  errorDismiss: {
    color: "#fca5a5",
    fontSize: 16,
    paddingLeft: 12,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  emptyText: {
    color: "#52525b",
    fontSize: 15,
    textAlign: "center",
    marginTop: 60,
    lineHeight: 24,
  },
  entry: {
    marginBottom: 14,
    borderLeftWidth: 2,
    borderLeftColor: "#3f3f46",
    paddingLeft: 12,
  },
  entryTime: {
    color: "#71717a",
    fontSize: 11,
    marginBottom: 3,
    fontVariant: ["tabular-nums"],
  },
  entryText: {
    color: "#e4e4e7",
    fontSize: 15,
    lineHeight: 22,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#27272a",
    backgroundColor: "#09090b",
  },
  footerBtn: {
    minWidth: 80,
    alignItems: "center",
    paddingVertical: 8,
  },
  footerBtnText: {
    color: "#a1a1aa",
    fontSize: 13,
  },
  recordBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#2563eb",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 50,
    minWidth: 140,
    justifyContent: "center",
  },
  recordBtnActive: {
    backgroundColor: "#dc2626",
  },
  recordBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#fff",
  },
  stopIcon: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: "#fff",
  },
  // 設定画面
  settingsWrap: {
    flex: 1,
    padding: 24,
  },
  settingsTitle: {
    color: "#f4f4f5",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 32,
  },
  label: {
    color: "#a1a1aa",
    fontSize: 13,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: "#18181b",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#3f3f46",
    borderRadius: 8,
    color: "#f4f4f5",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  hint: {
    color: "#52525b",
    fontSize: 12,
    marginTop: 8,
    marginBottom: 32,
  },
  saveBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  cancelBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelBtnText: {
    color: "#71717a",
    fontSize: 15,
  },
});
