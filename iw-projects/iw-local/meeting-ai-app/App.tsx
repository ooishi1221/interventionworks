import React, { useState, useRef, useCallback, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
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
  AppState,
} from "react-native";
import {
  useAudioRecorder,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
} from "expo-audio";
import type { AudioRecorder, RecordingOptions } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";

// ──────────────────────────────────────────
// Constants
// ──────────────────────────────────────────
const DEFAULT_WHISPER_URL = "http://100.86.242.55:8767";
const STORAGE_KEY_URL = "@meeting_ai_whisper_url";
const STORAGE_KEY_USER = "@meeting_ai_username";
const DEFAULT_USERNAME = "default";
const CHUNK_DURATION_MS = 30000;
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

interface SessionItem {
  filename: string;
  preview: string;
}

type Tab = "home" | "history" | "request" | "settings";

// ──────────────────────────────────────────
// App
// ──────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [whisperUrl, setWhisperUrl] = useState(DEFAULT_WHISPER_URL);
  const [urlInput, setUrlInput] = useState(DEFAULT_WHISPER_URL);
  const [username, setUsername] = useState(DEFAULT_USERNAME);
  const [usernameInput, setUsernameInput] = useState(DEFAULT_USERNAME);
  const [selectedRequests, setSelectedRequests] = useState<string[]>([]);
  const [requestMemo, setRequestMemo] = useState("");
  const [requestSaving, setRequestSaving] = useState(false);
  const [askInput, setAskInput] = useState("");
  const [askSending, setAskSending] = useState(false);
  const [askItems, setAskItems] = useState<{ id: string; q: string; a: string }[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<{ filename: string; content: string } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderA = useAudioRecorder(RECORDING_OPTIONS);
  const recorderB = useAudioRecorder(RECORDING_OPTIONS);

  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRecordingRef = useRef(false);
  const isSendingRef = useRef(false);
  const pendingChunksRef = useRef<string[]>([]);
  const activeRecorderIndexRef = useRef(0);
  const handoffInProgressRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  // ── URL / ユーザー名 読み込み ──
  useEffect(() => {
    AsyncStorage.multiGet([STORAGE_KEY_URL, STORAGE_KEY_USER]).then(([[, url], [, user]]) => {
      if (url) { setWhisperUrl(url); setUrlInput(url); }
      if (user) { setUsername(user); setUsernameInput(user); }
    });
  }, []);

  // ── スクロール最下部 ──
  useEffect(() => {
    if (entries.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [entries]);

  // ── チャンク送信（キュー方式） ──
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
        body: JSON.stringify({ audioBase64: base64, mimeType: "audio/m4a", user: username }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { text } = (await res.json()) as { text?: string };
      setError(null);
      if (text && text.trim().length > 0 && !isNoise(text.trim())) {
        setEntries((prev) => [
          ...prev,
          {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            timestamp: getTimestamp(),
            text: text.trim(),
          },
        ]);
      }
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch (err) {
      console.error("sendChunk error:", err);
      setError(`送信失敗: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      isSendingRef.current = false;
      setSending(false);
      setPendingCount(pendingChunksRef.current.length);
      if (pendingChunksRef.current.length > 0) processQueue();
    }
  }, [whisperUrl]);

  const sendChunk = useCallback(
    (uri: string) => {
      pendingChunksRef.current.push(uri);
      setPendingCount(pendingChunksRef.current.length);
      processQueue();
    },
    [processQueue]
  );

  const configureRecordingAudioSession = useCallback(async () => {
    await setAudioModeAsync({
      allowsRecording: true,
      allowsBackgroundRecording: true,
      shouldPlayInBackground: true,
      playsInSilentMode: true,
      interruptionMode: "doNotMix",
    });
    await setIsAudioActiveAsync(true);
  }, []);

  const getRecorder = useCallback(
    (index: number) => (index === 0 ? recorderA : recorderB),
    [recorderA, recorderB]
  );

  const copyChunkToDocumentDirectory = useCallback(async (uri: string) => {
    try {
      const destUri = `${FileSystem.documentDirectory}chunk_${Date.now()}.m4a`;
      await FileSystem.copyAsync({ from: uri, to: destUri });
      return destUri;
    } catch {
      return uri;
    }
  }, []);

  const startRecorder = useCallback(
    async (targetRecorder: AudioRecorder) => {
      await targetRecorder.prepareToRecordAsync(RECORDING_OPTIONS);
      targetRecorder.record();
    },
    []
  );

  const scheduleChunkHandoff = useCallback(
    (currentIndex: number) => {
      if (!isRecordingRef.current) return;

      chunkTimerRef.current = setTimeout(async () => {
        chunkTimerRef.current = null;
        if (!isRecordingRef.current || handoffInProgressRef.current) return;

        const currentRecorder = getRecorder(currentIndex);
        const nextIndex = currentIndex === 0 ? 1 : 0;
        const nextRecorder = getRecorder(nextIndex);
        handoffInProgressRef.current = true;

        try {
          try {
            await startRecorder(nextRecorder);
          } catch (startError) {
            console.warn("next chunk start error:", startError);
            if (isRecordingRef.current) {
              await configureRecordingAudioSession();
              scheduleChunkHandoff(currentIndex);
            }
            return;
          }

          activeRecorderIndexRef.current = nextIndex;

          try {
            await currentRecorder.stop();
            const uri = currentRecorder.uri;
            if (uri) {
              sendChunk(await copyChunkToDocumentDirectory(uri));
            }
          } catch (stopError) {
            console.warn("previous chunk stop error:", stopError);
          }

          scheduleChunkHandoff(nextIndex);
        } catch (e) {
          console.warn("chunk handoff error:", e);
          if (isRecordingRef.current) {
            try {
              await configureRecordingAudioSession();
            } catch (sessionError) {
              console.warn("audio session reactivate error:", sessionError);
            }
            scheduleChunkHandoff(currentIndex);
          }
        } finally {
          handoffInProgressRef.current = false;
        }
      }, CHUNK_DURATION_MS);
    },
    [
      configureRecordingAudioSession,
      copyChunkToDocumentDirectory,
      getRecorder,
      sendChunk,
      startRecorder,
    ]
  );

  // ── 1チャンク録音 → 送信 → ループ ──
  const recordChunk = useCallback(async (retryCount = 0): Promise<void> => {
    if (!isRecordingRef.current) return;

    try {
      const recorderIndex = activeRecorderIndexRef.current;
      await startRecorder(getRecorder(recorderIndex));
      scheduleChunkHandoff(recorderIndex);
    } catch (e) {
      console.error("recordChunk error:", e);
      if (isRecordingRef.current && retryCount < 3) {
        // オーディオセッション切断からの復帰を待ってリトライ
        await new Promise((r) => setTimeout(r, 5000));
        recordChunk(retryCount + 1);
      } else if (isRecordingRef.current) {
        setError("録音エラーが発生しました（バックグラウンドに長時間置くと止まる場合があります）");
        setIsRecording(false);
        isRecordingRef.current = false;
      }
    }
  }, [getRecorder, scheduleChunkHandoff, startRecorder]);

  // ── 録音開始 ──
  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const existingPermission = await getRecordingPermissionsAsync();
      const { granted } = existingPermission.granted
        ? existingPermission
        : await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert(
          "マイク許可が必要です",
          "設定からマイクへのアクセスを許可してください。"
        );
        return;
      }

      await configureRecordingAudioSession();

      activeRecorderIndexRef.current = 0;
      isRecordingRef.current = true;
      setIsRecording(true);
      // current.txt をクリアして新セッション開始
      fetch(`${whisperUrl}/start-session`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ user: username }) }).catch(() => {});
      await recordChunk();
    } catch (e) {
      console.error("startRecording error:", e);
      Alert.alert("エラー", "録音を開始できませんでした。");
      isRecordingRef.current = false;
      setIsRecording(false);
    }
  }, [configureRecordingAudioSession, recordChunk, whisperUrl]);

  // ── 録音停止 ──
  const stopRecording = useCallback(async () => {
    isRecordingRef.current = false;
    setIsRecording(false);

    if (chunkTimerRef.current) {
      clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }

    try {
      for (const targetRecorder of [recorderA, recorderB]) {
        if (targetRecorder.isRecording) {
          await targetRecorder.stop();
          const uri = targetRecorder.uri;
          if (uri) sendChunk(await copyChunkToDocumentDirectory(uri));
        }
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
    await setIsAudioActiveAsync(false);

    // セッションを自動保存して履歴を更新
    fetch(`${whisperUrl}/save-session`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ user: username }) })
      .then(() => fetchSessions())
      .catch(() => {});
  }, [copyChunkToDocumentDirectory, recorderA, recorderB, sendChunk, whisperUrl]);

  // ── クリーンアップ ──
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
      for (const targetRecorder of [recorderA, recorderB]) {
        if (targetRecorder.isRecording) {
          targetRecorder.stop().catch(() => {});
        }
      }
    };
  }, [recorderA, recorderB]);

  // ── 履歴タブ切り替え時に自動読み込み ──
  useEffect(() => {
    if (tab === "history") fetchSessions();
  }, [tab]);

  // ── フォアグラウンド復帰時に録音を自動再開 ──
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && isRecordingRef.current) {
        // チャンクタイマーが動いていない = バックグラウンドで止まっていた
        if (!chunkTimerRef.current) {
          configureRecordingAudioSession()
            .then(() => {
              if (!isRecordingRef.current) return;
              const activeIndex = activeRecorderIndexRef.current;
              if (getRecorder(activeIndex).isRecording) {
                scheduleChunkHandoff(activeIndex);
              } else {
                recordChunk(0);
              }
            })
            .catch(() => recordChunk(0));
        }
      }
    });
    return () => sub.remove();
  }, [configureRecordingAudioSession, getRecorder, recordChunk, scheduleChunkHandoff]);

  // ── セッション一覧取得 ──
  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch(`${whisperUrl}/sessions?user=${encodeURIComponent(username)}`);
      const data = await res.json() as { sessions: SessionItem[] };
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, [whisperUrl]);

  const openSession = useCallback(async (filename: string) => {
    try {
      const res = await fetch(`${whisperUrl}/sessions/${encodeURIComponent(filename)}?user=${encodeURIComponent(username)}`);
      const data = await res.json() as { content: string };
      setSelectedSession({ filename, content: data.content });
    } catch {
      Alert.alert("エラー", "セッションを開けませんでした");
    }
  }, [whisperUrl]);

  const deleteSession = useCallback((filename: string) => {
    Alert.alert("削除", `${filename} を削除しますか？`, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除", style: "destructive", onPress: async () => {
          await fetch(`${whisperUrl}/sessions/${encodeURIComponent(filename)}?user=${encodeURIComponent(username)}`, { method: "DELETE" });
          setSessions((prev) => prev.filter((s) => s.filename !== filename));
          if (selectedSession?.filename === filename) setSelectedSession(null);
        },
      },
    ]);
  }, [whisperUrl, selectedSession]);

  // ── お願い保存 ──
  const REQUEST_PRESETS = [
    "要約して",
    "質問ちょうだい",
    "技術的に可能か考えて",
    "アクションアイテムを出して",
    "議事録形式にして",
  ];

  const toggleRequest = useCallback((item: string) => {
    setSelectedRequests((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  }, []);

  const saveRequest = useCallback(async () => {
    setRequestSaving(true);
    try {
      await fetch(`${whisperUrl}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: selectedRequests, memo: requestMemo, user: username }),
      });
    } catch (err) {
      console.error("saveRequest error:", err);
    } finally {
      setRequestSaving(false);
    }
  }, [whisperUrl, selectedRequests, requestMemo]);

  // ── ベキたんに聞く（会議中に即質問） ──
  const askBecky = useCallback(async () => {
    const q = askInput.trim();
    if (!q || askSending) return;
    setAskSending(true);
    try {
      const res = await fetch(`${whisperUrl}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: username, question: q }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { answer } = (await res.json()) as { answer?: string };
      setAskItems((prev) => [
        { id: `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, q, a: answer ?? "(空の返答)" },
        ...prev,
      ]);
      setAskInput("");
    } catch (err) {
      setAskItems((prev) => [
        { id: `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, q, a: `⚠️ 失敗: ${err instanceof Error ? err.message : String(err)}` },
        ...prev,
      ]);
    } finally {
      setAskSending(false);
    }
  }, [whisperUrl, askInput, askSending, username]);

  // ── 設定保存 ──
  const saveSettings = useCallback(async () => {
    const url = urlInput.trim().replace(/\/$/, "");
    const user = usernameInput.trim().replace(/[^a-zA-Z0-9_-]/g, "") || DEFAULT_USERNAME;
    await AsyncStorage.multiSet([[STORAGE_KEY_URL, url], [STORAGE_KEY_USER, user]]);
    setWhisperUrl(url);
    setUsername(user);
    setUsernameInput(user);
  }, [urlInput, usernameInput]);

  // ──────────────────────────────────────────
  // Tab Contents
  // ──────────────────────────────────────────
  const renderHome = () => (
    <>
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Text style={styles.errorDismiss}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
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
    </>
  );

  const renderRequest = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.requestWrap}>
        <Text style={styles.requestTitle}>ベッキーへのお願い</Text>
        <Text style={styles.requestSub}>会議テキストをどう見てほしいか選んでね</Text>

        {REQUEST_PRESETS.map((item) => {
          const selected = selectedRequests.includes(item);
          return (
            <TouchableOpacity
              key={item}
              style={[styles.requestItem, selected && styles.requestItemSelected]}
              onPress={() => toggleRequest(item)}
              activeOpacity={0.7}
            >
              <Text style={[styles.requestItemCheck, selected && styles.requestItemCheckSelected]}>
                {selected ? "✓" : "○"}
              </Text>
              <Text style={[styles.requestItemText, selected && styles.requestItemTextSelected]}>
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}

        <Text style={[styles.label, { marginTop: 24 }]}>一言メモ（自由記入）</Text>
        <TextInput
          style={styles.memoInput}
          value={requestMemo}
          onChangeText={setRequestMemo}
          placeholder="例: 次回見積もりの話が出てたので確認して"
          placeholderTextColor="#52525b"
          multiline
          numberOfLines={3}
        />

        <TouchableOpacity
          style={[styles.saveBtn, { marginTop: 24 }]}
          onPress={saveRequest}
          disabled={requestSaving}
        >
          <Text style={styles.saveBtnText}>
            {requestSaving ? "保存中..." : "保存する"}
          </Text>
        </TouchableOpacity>
        <Text style={styles.hint}>「ベッキー会議のテキスト見て」で一気に伝わります</Text>

        <View style={styles.askDivider} />
        <Text style={styles.requestTitle}>💬 ベキたんに聞く</Text>
        <Text style={styles.requestSub}>会議中でも、その場で私に聞いて</Text>
        <TextInput
          style={styles.memoInput}
          value={askInput}
          onChangeText={setAskInput}
          placeholder="例: 今何が決まった？次のアクションは？"
          placeholderTextColor="#52525b"
          multiline
        />
        <TouchableOpacity
          style={[styles.saveBtn, { marginTop: 16 }]}
          onPress={askBecky}
          disabled={askSending}
        >
          <Text style={styles.saveBtnText}>{askSending ? "考え中..." : "聞く"}</Text>
        </TouchableOpacity>

        {askItems.map((it) => (
          <View key={it.id} style={styles.askItem}>
            <Text style={styles.askQ}>あなた: {it.q}</Text>
            <Text style={styles.askA}>{it.a}</Text>
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderHistory = () => {
    // セッション詳細表示
    if (selectedSession) {
      return (
        <>
          <View style={styles.historyDetailHeader}>
            <TouchableOpacity onPress={() => setSelectedSession(null)} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← 戻る</Text>
            </TouchableOpacity>
            <Text style={styles.historyDetailTitle} numberOfLines={1}>
              {selectedSession.filename.replace(".txt", "").replace("_", " ")}
            </Text>
            <View style={{ minWidth: 60 }} />
          </View>
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sessionContent}>{selectedSession.content}</Text>
          </ScrollView>
        </>
      );
    }

    return (
      <>
        <View style={styles.historyHeader}>
          <Text style={styles.historyHeaderTitle}>保存済みセッション</Text>
          <TouchableOpacity onPress={fetchSessions} style={styles.refreshBtn}>
            <Text style={styles.refreshBtnText}>更新</Text>
          </TouchableOpacity>
        </View>
        {sessionsLoading ? (
          <View style={styles.placeholderWrap}>
            <ActivityIndicator size="large" color="#60a5fa" />
          </View>
        ) : sessions.length === 0 ? (
          <View style={styles.placeholderWrap}>
            <Text style={styles.placeholderText}>セッションなし</Text>
            <Text style={styles.placeholderSub}>録音後に保存するとここに表示されます</Text>
            <TouchableOpacity onPress={fetchSessions} style={[styles.saveBtn, { marginTop: 24, paddingHorizontal: 32 }]}>
              <Text style={styles.saveBtnText}>読み込む</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            {sessions.map((s) => (
              <View key={s.filename} style={styles.sessionItem}>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => openSession(s.filename)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.sessionFilename}>
                    {s.filename.replace(".txt", "").replace("_", " ")}
                  </Text>
                  {s.preview ? (
                    <Text style={styles.sessionPreview} numberOfLines={1}>{s.preview}</Text>
                  ) : null}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteSession(s.filename)} style={styles.sessionDeleteBtn}>
                  <Ionicons name="trash-outline" size={18} color="#52525b" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      </>
    );
  };

  const renderSettings = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.settingsWrap}>
        <Text style={styles.label}>ユーザー名</Text>
        <TextInput
          style={styles.input}
          value={usernameInput}
          onChangeText={setUsernameInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="例: yuji, tanaka"
          placeholderTextColor="#52525b"
        />
        <Text style={styles.hint}>
          英数字・ハイフン・アンダースコアのみ。友達と共有する場合は別の名前に。
        </Text>

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
          <Text style={styles.saveBtnText}>保存</Text>
        </TouchableOpacity>
        <Text style={styles.currentUrl}>ユーザー: {username}</Text>
        <Text style={styles.currentUrl}>接続先: {whisperUrl}</Text>
        <Text style={[styles.hint, { marginTop: 16 }]}>
          Claude Codeで読む場合: {whisperUrl}/current/{username}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  // ──────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>MAI</Text>
        <View style={styles.headerRight}>
          {(sending || pendingCount > 0) && (
            <View style={styles.processingBadge}>
              <ActivityIndicator size="small" color="#60a5fa" style={{ marginRight: 6 }} />
              <Text style={styles.processingText}>
                {pendingCount > 0 ? `残り${pendingCount}件` : "処理中"}
              </Text>
            </View>
          )}
          {tab === "home" && entries.length > 0 && (
            <TouchableOpacity
              onPress={() =>
                Alert.alert("クリア", "文字起こしをすべて削除しますか？", [
                  { text: "キャンセル", style: "cancel" },
                  { text: "削除", style: "destructive", onPress: () => setEntries([]) },
                ])
              }
            >
              <Ionicons name="trash-outline" size={20} color="#52525b" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* コンテンツ */}
      <View style={{ flex: 1 }}>
        {tab === "home" && renderHome()}
        {tab === "history" && renderHistory()}
        {tab === "request" && renderRequest()}
        {tab === "settings" && renderSettings()}
      </View>

      {/* タブバー */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setTab("home")}>
          <Ionicons
            name={tab === "home" ? "home" : "home-outline"}
            size={22}
            color={tab === "home" ? "#60a5fa" : "#52525b"}
          />
          <Text style={[styles.tabLabel, tab === "home" && styles.tabLabelActive]}>ホーム</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabItem} onPress={() => setTab("history")}>
          <Ionicons
            name={tab === "history" ? "time" : "time-outline"}
            size={22}
            color={tab === "history" ? "#60a5fa" : "#52525b"}
          />
          <Text style={[styles.tabLabel, tab === "history" && styles.tabLabelActive]}>履歴</Text>
        </TouchableOpacity>

        {/* 中央録音ボタン */}
        <View style={styles.tabRecordWrap}>
          <TouchableOpacity
            style={[styles.tabRecordBtn, isRecording && styles.tabRecordBtnActive]}
            onPress={isRecording ? stopRecording : startRecording}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isRecording ? "stop" : "mic"}
              size={22}
              color="#fff"
            />
          </TouchableOpacity>
          <Text style={[styles.tabLabel, isRecording && { color: "#f87171" }]}>
            {isRecording ? "停止" : "録音"}
          </Text>
        </View>

        <TouchableOpacity style={styles.tabItem} onPress={() => setTab("request")}>
          <Ionicons
            name={tab === "request" ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"}
            size={22}
            color={tab === "request" ? "#60a5fa" : "#52525b"}
          />
          <Text style={[styles.tabLabel, tab === "request" && styles.tabLabelActive]}>お願い</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabItem} onPress={() => setTab("settings")}>
          <Ionicons
            name={tab === "settings" ? "settings" : "settings-outline"}
            size={22}
            color={tab === "settings" ? "#60a5fa" : "#52525b"}
          />
          <Text style={[styles.tabLabel, tab === "settings" && styles.tabLabelActive]}>設定</Text>
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
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  processingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e3a5f",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  processingText: {
    color: "#60a5fa",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  headerTitle: {
    color: "#f4f4f5",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.3,
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
  clearBtn: {
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginBottom: 8,
  },
  clearBtnText: {
    color: "#71717a",
    fontSize: 13,
  },
  // プレースホルダー
  placeholderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    color: "#52525b",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  placeholderSub: {
    color: "#3f3f46",
    fontSize: 13,
  },
  // 設定
  settingsWrap: {
    padding: 24,
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
    marginBottom: 24,
  },
  saveBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  currentUrl: {
    color: "#52525b",
    fontSize: 12,
    textAlign: "center",
  },
  // 履歴タブ
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#27272a",
  },
  historyHeaderTitle: {
    color: "#f4f4f5",
    fontSize: 15,
    fontWeight: "600",
  },
  refreshBtn: {
    padding: 4,
  },
  refreshBtnText: {
    color: "#60a5fa",
    fontSize: 14,
  },
  sessionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#18181b",
    marginBottom: 10,
  },
  sessionFilename: {
    color: "#e4e4e7",
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 4,
  },
  sessionPreview: {
    color: "#71717a",
    fontSize: 12,
  },
  sessionDeleteBtn: {
    padding: 8,
    marginLeft: 4,
  },
  historyDetailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#27272a",
  },
  historyDetailTitle: {
    color: "#f4f4f5",
    fontSize: 13,
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  backBtn: {
    padding: 4,
    minWidth: 60,
  },
  backBtnText: {
    color: "#60a5fa",
    fontSize: 14,
  },
  deleteBtnText: {
    color: "#f87171",
    fontSize: 14,
    minWidth: 60,
    textAlign: "right",
  },
  sessionContent: {
    color: "#a1a1aa",
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  // お願いタブ
  requestWrap: {
    padding: 24,
  },
  requestTitle: {
    color: "#f4f4f5",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  requestSub: {
    color: "#71717a",
    fontSize: 13,
    marginBottom: 24,
  },
  requestItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#3f3f46",
    marginBottom: 10,
    backgroundColor: "#18181b",
  },
  requestItemSelected: {
    borderColor: "#3b82f6",
    backgroundColor: "#1e3a5f",
  },
  requestItemCheck: {
    fontSize: 16,
    color: "#52525b",
    width: 20,
    textAlign: "center",
  },
  requestItemCheckSelected: {
    color: "#60a5fa",
  },
  requestItemText: {
    color: "#a1a1aa",
    fontSize: 15,
  },
  requestItemTextSelected: {
    color: "#e4e4e7",
  },
  memoInput: {
    backgroundColor: "#18181b",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#3f3f46",
    borderRadius: 8,
    color: "#f4f4f5",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 80,
    textAlignVertical: "top",
  },
  askDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#27272a",
    marginTop: 32,
    marginBottom: 24,
  },
  askItem: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#18181b",
  },
  askQ: {
    color: "#71717a",
    fontSize: 13,
    marginBottom: 8,
  },
  askA: {
    color: "#e4e4e7",
    fontSize: 15,
    lineHeight: 22,
  },
  // タブバー
  tabBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#27272a",
    backgroundColor: "#09090b",
    paddingBottom: 8,
    paddingTop: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
  },
  tabIcon: {
    fontSize: 20,
    color: "#52525b",
    marginBottom: 2,
  },
  tabIconActive: {
    color: "#60a5fa",
  },
  tabLabel: {
    fontSize: 10,
    color: "#52525b",
  },
  tabLabelActive: {
    color: "#60a5fa",
  },
  // 中央録音ボタン
  tabRecordWrap: {
    flex: 1,
    alignItems: "center",
    marginBottom: 4,
  },
  tabRecordBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    marginTop: -20,
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  tabRecordBtnActive: {
    backgroundColor: "#dc2626",
    shadowColor: "#dc2626",
  },
  recDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#fff",
  },
  stopIcon: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: "#fff",
  },
});
