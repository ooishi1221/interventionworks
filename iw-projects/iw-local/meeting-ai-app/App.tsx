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
  Switch,
  Animated,
} from "react-native";
import {
  useAudioRecorder,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
  IOSOutputFormat,
  AudioQuality,
} from "expo-audio";
import type { AudioRecorder, RecordingOptions } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { initWhisper } from "whisper.rn";
import type { WhisperContext } from "whisper.rn";

// ──────────────────────────────────────────
// Constants
// ──────────────────────────────────────────
const DEFAULT_WHISPER_URL = "http://100.86.242.55:8767";
const STORAGE_KEY_URL = "@meeting_ai_whisper_url";
const STORAGE_KEY_USER = "@meeting_ai_username";
const STORAGE_KEY_LOCAL = "@meeting_ai_local_mode";
const DEFAULT_USERNAME = "default";
// チャンク回転間隔のノブ。端末内モードはレスポンス優先で短く、サーバーモードは話者分離の精度優先で長く。
const SERVER_CHUNK_MS = 45000;
const LOCAL_CHUNK_MS = 20000; // ponytail: 体感で 15s まで下げられる
const RECORDING_OPTIONS: RecordingOptions = RecordingPresets.HIGH_QUALITY;

// 端末内文字起こし用モデル（差し替えノブ: filename/url/sizeMB を差し替えるだけで別モデルに）
const WHISPER_MODEL = {
  filename: "ggml-large-v3-turbo-q5_0.bin",
  url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
  sizeMB: 574,
};
const MODEL_PATH = `${FileSystem.documentDirectory}${WHISPER_MODEL.filename}`;

// whisper.rn は WAV/16bit PCM のみ受け付ける（m4a 不可）。ローカルモード時だけこの設定で録音する。
const WAV_RECORDING_OPTIONS: RecordingOptions = {
  extension: ".wav",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000, // 16000Hz * 16bit * 1ch
  android: { outputFormat: "default", audioEncoder: "default" }, // Android はローカルモード非対応（未使用）
  ios: {
    extension: ".wav",
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: "audio/wav", bitsPerSecond: 256000 },
};

const NOISE_PATTERNS = [
  "ご視聴ありがとう",
  "日本語の会議",
  "次回予告",
  "チャンネル登録",
  "字幕",
];

// サーバー whisper_server.py の remove_fillers を JS 移植（表示用。/append 側でも再実行されるので冪等でよい）
const FILLER_PATTERN =
  /(?:えーっと|えーと|えっと|えー、?|あのー|あの[ーっ]|あのう|あの、|うーん|うーんと|まあ(?=[、。\s]|$)|そうですね(?=[、。\s]|$)|ですね(?=[、。\s]|$)|なんか(?=[、。\s]|$))/gu;

function removeFillers(text: string): string {
  let cleaned = text.replace(FILLER_PATTERN, "");
  cleaned = cleaned.replace(/[　\s]+/g, " ").trim();
  cleaned = cleaned.replace(/、{2,}/g, "、");
  return cleaned;
}

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

type Tab = "home" | "history" | "settings";

// ──────────────────────────────────────────
// App
// ──────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [whisperUrl, setWhisperUrl] = useState(DEFAULT_WHISPER_URL);
  const [urlInput, setUrlInput] = useState(DEFAULT_WHISPER_URL);
  const [username, setUsername] = useState(DEFAULT_USERNAME);
  const [usernameInput, setUsernameInput] = useState(DEFAULT_USERNAME);
  const [homeInput, setHomeInput] = useState("");
  const [homeMode, setHomeMode] = useState<"ask" | "request">("ask"); // 入力バーの送信先。デフォルトは「聞く」
  const [homeReqDone, setHomeReqDone] = useState(false);
  const [askSending, setAskSending] = useState(false);
  const [thinkingDots, setThinkingDots] = useState("");
  const [askItems, setAskItems] = useState<{ id: string; q: string; a: string }[]>([]);
  const [askExpanded, setAskExpanded] = useState(false);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<{ filename: string; content: string } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingTextCount, setPendingTextCount] = useState(0); // 端末内モードの未送信テキスト数（表示用、pendingTextsRef と同期）
  const [error, setError] = useState<string | null>(null);
  const [localMode, setLocalMode] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [dlProgress, setDlProgress] = useState<number | null>(null); // null=非DL中 / 0〜1=進捗
  const [canResume, setCanResume] = useState(false); // DL中断からの再開ボタン表示

  const recorderA = useAudioRecorder(RECORDING_OPTIONS);
  const recorderB = useAudioRecorder(RECORDING_OPTIONS);

  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRecordingRef = useRef(false);
  const isSendingRef = useRef(false);
  const pendingChunksRef = useRef<string[]>([]);
  const activeRecorderIndexRef = useRef(0);
  const handoffInProgressRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const localModeRef = useRef(false);
  const whisperCtxRef = useRef<WhisperContext | null>(null);
  const pendingTextsRef = useRef<{ text: string; ts: string }[]>([]);
  const isFlushingRef = useRef(false);
  const downloadRef = useRef<FileSystem.DownloadResumable | null>(null);
  const breatheAnim = useRef(new Animated.Value(1)).current; // 気配ドット（考え中）の呼吸

  // ── URL / ユーザー名 / ローカルモード 読み込み ──
  useEffect(() => {
    AsyncStorage.multiGet([STORAGE_KEY_URL, STORAGE_KEY_USER, STORAGE_KEY_LOCAL]).then(
      ([[, url], [, user], [, local]]) => {
        if (url) { setWhisperUrl(url); setUrlInput(url); }
        if (user) { setUsername(user); setUsernameInput(user); }
        if (local === "1") { setLocalMode(true); localModeRef.current = true; }
      }
    );
    // モデルが既にDL済みか確認（iOSのみ）
    if (Platform.OS === "ios") {
      FileSystem.getInfoAsync(MODEL_PATH).then((info) => setModelReady(info.exists)).catch(() => {});
    }
  }, []);

  // ── スクロール最下部 ──
  useEffect(() => {
    if (entries.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [entries]);

  // ── 考え中の「.」「..」「...」ループ ──
  useEffect(() => {
    if (!askSending) { setThinkingDots(""); return; }
    setThinkingDots(".");
    const id = setInterval(() => {
      setThinkingDots((d) => (d.length >= 3 ? "." : d + "."));
    }, 400);
    return () => clearInterval(id);
  }, [askSending]);

  // ── 気配ドット: 考え中は点滅、それ以外は常在（不透明度1） ──
  useEffect(() => {
    if (!askSending) { breatheAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        Animated.timing(breatheAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [askSending, breatheAnim]);

  // ── テキスト後送（ローカルモード: /append へ。圏外なら保持して次回再送） ──
  const flushTexts = useCallback(async (): Promise<void> => {
    if (isFlushingRef.current) return;
    isFlushingRef.current = true;
    try {
      while (pendingTextsRef.current.length > 0) {
        const item = pendingTextsRef.current[0];
        const res = await fetch(`${whisperUrl}/append`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: item.text, ts: item.ts, user: username }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        pendingTextsRef.current.shift();
        setPendingTextCount(pendingTextsRef.current.length);
      }
    } catch {
      // 圏外/失敗 → キュー先頭に残したまま。次の flushTexts で再送
    } finally {
      isFlushingRef.current = false;
    }
  }, [whisperUrl, username]);

  // ── チャンク送信（キュー方式。ローカルモード=端末内whisper / OFF=音声POST） ──
  const processQueue = useCallback(async (): Promise<void> => {
    if (isSendingRef.current) return;
    const uri = pendingChunksRef.current.shift();
    if (!uri) return;

    isSendingRef.current = true;
    setSending(true);
    let failed = false;
    try {
      if (localModeRef.current && Platform.OS === "ios") {
        // 端末内文字起こし
        const ctx = whisperCtxRef.current;
        if (!ctx) throw new Error("whisper未ロード");
        const started = Date.now();
        const { promise } = ctx.transcribe(uri, { language: "ja" });
        const { result } = await promise;
        const elapsed = ((Date.now() - started) / 1000).toFixed(1);
        const cleaned = removeFillers((result ?? "").trim());
        setError(null);
        if (cleaned.length > 0 && !isNoise(cleaned)) {
          const ts = getTimestamp();
          setEntries((prev) => [
            ...prev,
            {
              id: `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
              timestamp: `${ts} (${elapsed}s)`,
              text: cleaned,
            },
          ]);
          pendingTextsRef.current.push({ text: cleaned, ts });
          setPendingTextCount(pendingTextsRef.current.length);
          flushTexts();
        }
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } else {
        // 従来: 音声を POST /transcribe（話者分離が要る会議の保険）
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
      }
    } catch (err) {
      console.error("processQueue error:", err);
      setError(`送信失敗: ${err instanceof Error ? err.message : String(err)}`);
      // 失敗チャンクはキューに戻す（音声ファイル残存=データロスゼロ）。復帰時に再消化
      pendingChunksRef.current.unshift(uri);
      failed = true;
    } finally {
      isSendingRef.current = false;
      setSending(false);
      setPendingCount(pendingChunksRef.current.length);
      // キュー消化しきって録音停止済みなら whisper を解放（非会議時に~700MB常駐でjetsamを招かない）
      if (
        localModeRef.current &&
        pendingChunksRef.current.length === 0 &&
        !isRecordingRef.current &&
        whisperCtxRef.current
      ) {
        whisperCtxRef.current.release().catch(() => {});
        whisperCtxRef.current = null;
      }
      // 失敗時はタイトループを避け、次のチャンク到着 / フォアグラウンド復帰で消化する
      if (!failed && pendingChunksRef.current.length > 0) processQueue();
    }
  }, [whisperUrl, username, flushTexts]);

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
      const dot = uri.lastIndexOf(".");
      const ext = dot >= 0 ? uri.slice(dot) : ".m4a";
      const destUri = `${FileSystem.documentDirectory}chunk_${Date.now()}${ext}`;
      await FileSystem.copyAsync({ from: uri, to: destUri });
      return destUri;
    } catch {
      return uri;
    }
  }, []);

  const startRecorder = useCallback(
    async (targetRecorder: AudioRecorder) => {
      await targetRecorder.prepareToRecordAsync(
        localModeRef.current ? WAV_RECORDING_OPTIONS : RECORDING_OPTIONS
      );
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
      }, localModeRef.current ? LOCAL_CHUNK_MS : SERVER_CHUNK_MS);
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

  // ── 録音開始（本体。freshSession=true なら entries クリア + サーバー側 current もクリア） ──
  const beginRecording = useCallback(async (freshSession: boolean) => {
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

      // ローカルモード: モデル確認 + whisper 遅延ロード
      if (localModeRef.current && Platform.OS === "ios") {
        if (!modelReady) {
          Alert.alert(
            "モデル未ダウンロード",
            "設定タブで文字起こしモデル（574MB）をダウンロードしてください。"
          );
          return;
        }
        if (!whisperCtxRef.current) {
          try {
            whisperCtxRef.current = await initWhisper({ filePath: MODEL_PATH });
          } catch (e) {
            console.error("initWhisper error:", e);
            Alert.alert("エラー", "文字起こしモデルの読み込みに失敗しました。");
            return;
          }
        }
      }

      await configureRecordingAudioSession();

      activeRecorderIndexRef.current = 0;
      isRecordingRef.current = true;
      setIsRecording(true);
      if (freshSession) {
        setEntries([]);
        // current.txt をクリアして新セッション開始
        fetch(`${whisperUrl}/start-session`, { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ user: username }) }).catch(() => {});
      }
      // freshSession=false: entries もサーバー current も残したまま追記継続
      await recordChunk();
    } catch (e) {
      console.error("beginRecording error:", e);
      Alert.alert("エラー", "録音を開始できませんでした。");
      isRecordingRef.current = false;
      setIsRecording(false);
    }
  }, [configureRecordingAudioSession, recordChunk, whisperUrl, username, modelReady]);

  // ── 録音ボタン: 既存の文字起こしがあれば新規/追記を確認してから開始 ──
  const startRecording = useCallback(() => {
    if (entries.length > 0) {
      Alert.alert("録音を開始", "前回の文字起こしが残っています。", [
        { text: "新規セッション", onPress: () => beginRecording(true) },
        { text: "前回に追記", onPress: () => beginRecording(false) },
        { text: "キャンセル", style: "cancel" },
      ]);
      return;
    }
    beginRecording(true);
  }, [entries.length, beginRecording]);

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
      if (nextState !== "active") return;
      // フォアグラウンド復帰: 滞留したチャンク / 未送信テキストを消化
      processQueue();
      flushTexts();
      if (isRecordingRef.current) {
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
  }, [configureRecordingAudioSession, getRecorder, recordChunk, scheduleChunkHandoff, processQueue, flushTexts]);

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

  // ── お願い（付箋）を1行で送る。/request append:true が付箋機能の唯一の入口 ──
  const sendHomeRequest = useCallback(async () => {
    const memo = homeInput.trim();
    if (!memo) return;
    try {
      await fetch(`${whisperUrl}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [], memo, user: username, append: true }),
      });
      setHomeInput("");
      setHomeReqDone(true);
      setTimeout(() => setHomeReqDone(false), 1500);
    } catch (err) {
      console.error("sendHomeRequest error:", err);
    }
  }, [whisperUrl, homeInput, username]);

  // ── ベキたんに聞く（会議中に即質問。15秒でタイムアウト） ──
  const askBecky = useCallback(async () => {
    const q = homeInput.trim();
    if (!q || askSending) return;
    setAskSending(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${whisperUrl}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: username, question: q }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { answer } = (await res.json()) as { answer?: string };
      setAskItems((prev) => [
        { id: `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, q, a: answer ?? "(空の返答)" },
        ...prev,
      ]);
      setHomeInput("");
    } catch (err) {
      const msg = controller.signal.aborted
        ? "時間切れ、もう一度聞いて"
        : `⚠️ 失敗: ${err instanceof Error ? err.message : String(err)}`;
      setAskItems((prev) => [
        { id: `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, q, a: msg },
        ...prev,
      ]);
    } finally {
      clearTimeout(timer);
      setAskSending(false);
    }
  }, [whisperUrl, homeInput, askSending, username]);

  // ── 統合入力バーの送信ルーター（トグルで送信先が切り替わる） ──
  const onHomeSubmit = useCallback(() => {
    if (homeMode === "ask") askBecky();
    else sendHomeRequest();
  }, [homeMode, askBecky, sendHomeRequest]);

  // ── 設定保存 ──
  const saveSettings = useCallback(async () => {
    const url = urlInput.trim().replace(/\/$/, "");
    const user = usernameInput.trim().replace(/[^a-zA-Z0-9_-]/g, "") || DEFAULT_USERNAME;
    await AsyncStorage.multiSet([[STORAGE_KEY_URL, url], [STORAGE_KEY_USER, user]]);
    setWhisperUrl(url);
    setUsername(user);
    setUsernameInput(user);
  }, [urlInput, usernameInput]);

  // ── ローカルモード切替（録音中は不可） ──
  const toggleLocalMode = useCallback((val: boolean) => {
    setLocalMode(val);
    localModeRef.current = val;
    AsyncStorage.setItem(STORAGE_KEY_LOCAL, val ? "1" : "0").catch(() => {});
  }, []);

  // ── モデルダウンロード（.part に落として完走後 moveAsync） ──
  const downloadModel = useCallback(async () => {
    if (Platform.OS !== "ios") return;
    const partPath = `${MODEL_PATH}.part`;
    setCanResume(false);
    setDlProgress(0);
    try {
      const dl = FileSystem.createDownloadResumable(
        WHISPER_MODEL.url,
        partPath,
        {},
        (p) => {
          const total = p.totalBytesExpectedToWrite || WHISPER_MODEL.sizeMB * 1024 * 1024;
          setDlProgress(p.totalBytesWritten / total);
        }
      );
      downloadRef.current = dl;
      const result = await dl.downloadAsync();
      if (result) {
        await FileSystem.moveAsync({ from: partPath, to: MODEL_PATH });
        setModelReady(true);
        downloadRef.current = null;
      }
      setDlProgress(null);
    } catch (err) {
      // 中断: downloadRef は残す（再開ボタンで resumeAsync）
      setError(`モデルDL失敗: ${err instanceof Error ? err.message : String(err)}`);
      setCanResume(true);
    }
  }, []);

  const resumeDownload = useCallback(async () => {
    const dl = downloadRef.current;
    if (!dl) { downloadModel(); return; }
    setCanResume(false);
    try {
      const result = await dl.resumeAsync();
      if (result) {
        await FileSystem.moveAsync({ from: `${MODEL_PATH}.part`, to: MODEL_PATH });
        setModelReady(true);
        downloadRef.current = null;
        setDlProgress(null);
      }
    } catch (err) {
      setError(`再開失敗: ${err instanceof Error ? err.message : String(err)}`);
      setCanResume(true);
    }
  }, [downloadModel]);

  // ──────────────────────────────────────────
  // Tab Contents
  // ──────────────────────────────────────────
  const renderHome = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.modeBar}>
        <Text style={styles.modeText}>
          {localMode
            ? `📱 端末内${pendingTextCount > 0 ? ` (後送待ち${pendingTextCount}件)` : ""}`
            : "🖥️ サーバー"}
        </Text>
      </View>
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
          // ponytail: FlatList化は次ラウンド、まず表示上限で足りる
          entries.slice(-100).map((e) => (
            <View key={e.id} style={styles.entry}>
              <Text style={styles.entryTime}>{e.timestamp}</Text>
              <Text selectable style={styles.entryText}>{e.text}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* 会議中にその場で聞く（直近1件、タップで展開）。左の縦線＋「ベキたん:」で同席感 */}
      {askItems[0] && (
        <TouchableOpacity
          style={styles.homeAskCard}
          onPress={() => setAskExpanded((v) => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.askQ} numberOfLines={1}>あなた: {askItems[0].q}</Text>
          <Text style={styles.askBeckyLabel}>ベキたん:</Text>
          <Text selectable style={styles.askA} numberOfLines={askExpanded ? undefined : 2}>
            {askItems[0].a}
          </Text>
        </TouchableOpacity>
      )}

      {/* 統合入力バー: 左のトグルで [💬聞く | 📌お願い] を切替。会議中に指が迷う分岐をゼロに */}
      <View style={styles.homeAskBar}>
        <View style={styles.segToggle}>
          <TouchableOpacity
            style={[styles.segBtn, homeMode === "ask" && styles.segBtnActive]}
            onPress={() => setHomeMode("ask")}
          >
            <Text style={[styles.segText, homeMode === "ask" && styles.segTextActive]}>💬</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segBtn, homeMode === "request" && styles.segBtnActive]}
            onPress={() => setHomeMode("request")}
          >
            <Text style={[styles.segText, homeMode === "request" && styles.segTextActive]}>📌</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.homeAskInput}
          value={homeInput}
          onChangeText={setHomeInput}
          placeholder={homeMode === "ask" ? "ベキたんに聞く…" : "お願いを付箋で残す…"}
          placeholderTextColor="#52525b"
          returnKeyType="send"
          onSubmitEditing={onHomeSubmit}
        />
        <TouchableOpacity
          style={styles.homeAskSend}
          onPress={onHomeSubmit}
          disabled={homeMode === "ask" && askSending}
        >
          <Text style={styles.homeAskSendText}>
            {homeMode === "ask"
              ? (askSending ? thinkingDots : "送信")
              : (homeReqDone ? "✓ 送った" : "お願い")}
          </Text>
        </TouchableOpacity>
      </View>
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
        {Platform.OS === "ios" && (
          <>
            <Text style={styles.label}>端末内文字起こし</Text>
            <View style={styles.localRow}>
              <Text style={styles.localRowLabel}>
                iPhone内で処理（オフライン対応）
              </Text>
              <Switch
                value={localMode}
                onValueChange={toggleLocalMode}
                disabled={isRecording}
              />
            </View>
            <View style={styles.modelStatusRow}>
              {modelReady ? (
                <Text style={styles.modelStatusReady}>✓ モデル準備完了</Text>
              ) : dlProgress !== null ? (
                <Text style={styles.modelStatusText}>
                  ダウンロード中… {Math.round(dlProgress * 100)}%
                </Text>
              ) : canResume ? (
                <TouchableOpacity onPress={resumeDownload}>
                  <Text style={styles.modelDlBtn}>再開する</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={downloadModel} disabled={isRecording}>
                  <Text style={styles.modelDlBtn}>
                    モデルをダウンロード（{WHISPER_MODEL.sizeMB}MB）
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.hint}>
              574MBのモデルを初回のみDL。Wi-Fi推奨。ONにすると音声を外に送らず端末内で文字起こしします（話者分離は無し）。録音中は切替できません。
            </Text>
          </>
        )}

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
  // 気配ドットの色: 考え中=水色(点滅) / 録音中=薄い水色(点灯) / アイドル=グレー
  const dotColor = askSending ? "#60a5fa" : isRecording ? "#7dd3fc" : "#3f3f46";

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* ヘッダー */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Animated.View
            style={[styles.presenceDot, { backgroundColor: dotColor, opacity: askSending ? breatheAnim : 1 }]}
          />
          <Text style={styles.headerTitle}>MAI</Text>
        </View>
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

      {/* エラーバナー（タブ共通。どのタブでも見える） */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Text style={styles.errorDismiss}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* コンテンツ */}
      <View style={{ flex: 1 }}>
        {tab === "home" && renderHome()}
        {tab === "history" && renderHistory()}
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
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
  localRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  localRowLabel: {
    color: "#e4e4e7",
    fontSize: 15,
    flex: 1,
    marginRight: 12,
  },
  modelStatusRow: {
    marginTop: 12,
    marginBottom: 4,
  },
  modelStatusText: {
    color: "#60a5fa",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  modelStatusReady: {
    color: "#4ade80",
    fontSize: 14,
  },
  modelDlBtn: {
    color: "#60a5fa",
    fontSize: 14,
    fontWeight: "600",
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
  modeBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
  },
  modeText: {
    color: "#71717a",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  homeAskCard: {
    marginHorizontal: 12,
    marginBottom: 6,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#18181b",
    borderLeftWidth: 3,
    borderLeftColor: "#60a5fa",
  },
  askBeckyLabel: {
    color: "#60a5fa",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  segToggle: {
    flexDirection: "row",
    backgroundColor: "#18181b",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#3f3f46",
    padding: 2,
  },
  segBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
  },
  segBtnActive: {
    backgroundColor: "#1e3a5f",
  },
  segText: {
    fontSize: 15,
    opacity: 0.5,
  },
  segTextActive: {
    opacity: 1,
  },
  homeAskBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#27272a",
  },
  homeAskInput: {
    flex: 1,
    backgroundColor: "#18181b",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#3f3f46",
    borderRadius: 20,
    color: "#f4f4f5",
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  homeAskSend: {
    backgroundColor: "#2563eb",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  homeAskSendText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
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
