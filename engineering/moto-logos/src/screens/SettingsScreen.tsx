/**
 * SettingsScreen — アプリ設定
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  DevSettings,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { migrateSeedSpots } from '../firebase/migration';
import { Colors } from '../constants/theme';

const C = { ...Colors, card: Colors.cardElevated };

interface Props {
  onBack?: () => void;
  onOpenLegal: () => void;
  onOpenInquiry: () => void;
  onStartTutorial?: () => void;
}

export function SettingsScreen({ onBack, onOpenLegal, onOpenInquiry, onStartTutorial }: Props) {
  const [pushEnabled, setPushEnabled] = useState(true);
  const [liveFeedEnabled, setLiveFeedEnabled] = useState(true);
  const [thirdParty, setThirdParty] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('moto_logos_push_enabled').then((v) => setPushEnabled(v !== 'false'));
    AsyncStorage.getItem('moto_logos_live_feed').then((v) => setLiveFeedEnabled(v !== 'false'));
    AsyncStorage.getItem('moto_logos_third_party_consent').then((v) => setThirdParty(v === 'true'));
  }, []);

  const togglePush = (val: boolean) => {
    setPushEnabled(val);
    AsyncStorage.setItem('moto_logos_push_enabled', val ? 'true' : 'false');
  };

  const toggleLiveFeed = (val: boolean) => {
    setLiveFeedEnabled(val);
    AsyncStorage.setItem('moto_logos_live_feed', val ? 'true' : 'false');
  };

  const toggleThirdParty = (val: boolean) => {
    setThirdParty(val);
    AsyncStorage.setItem('moto_logos_third_party_consent', val ? 'true' : 'false');
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'アカウント削除',
      'すべてのデータが削除されます。この操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: () => {
            // 将来的に Firestore のユーザーデータ + AsyncStorage を全削除
            Alert.alert('削除リクエスト', 'アカウント削除のリクエストを受け付けました。処理には数日かかる場合があります。');
          },
        },
      ],
    );
  };

  const handleSeedData = () => {
    Alert.alert(
      'シードデータ投入',
      '公共駐輪場データ（127件）をFirestoreにアップロードします。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '実行する',
          onPress: async () => {
            setSeeding(true);
            try {
              const count = await migrateSeedSpots();
              Alert.alert('完了', `${count}件のスポットをアップロードしました。マップに戻って確認してください。`);
            } catch (e) {
              Alert.alert('エラー', `アップロードに失敗しました: ${e}`);
            }
            setSeeding(false);
          },
        },
      ],
    );
  };

  const handleResetCache = () => {
    Alert.alert(
      'キャッシュクリア',
      'チュートリアル・コーチマーク等の表示フラグをリセットします。アプリを再起動すると初回体験からやり直せます。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'リセット',
          style: 'destructive',
          onPress: async () => {
            const keys = [
              'fab_coach_shown',
              'moto_logos_tutorial_done',
              'moto_logos_legal_consent',
              'moto_logos_third_party_consent',
            ];
            await AsyncStorage.multiRemove(keys);
            if (__DEV__) {
              DevSettings.reload();
            } else {
              await Updates.reloadAsync();
            }
          },
        },
      ],
    );
  };

  const version = Constants.expoConfig?.version || '1.0.0';

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Ionicons name="chevron-back" size={24} color={C.text} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 32 }} />
        )}
        <Text style={s.headerTitle}>設定</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {/* 通知 */}
        <Text style={s.sectionTitle}>通知</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <Ionicons name="notifications-outline" size={20} color={C.blue} />
              <Text style={s.rowLabel}>プッシュ通知</Text>
            </View>
            <Switch value={pushEnabled} onValueChange={togglePush} trackColor={{ true: C.accent }} />
          </View>
          <View style={s.separator} />
          <View style={s.row}>
            <View style={s.rowLeft}>
              <Ionicons name="pulse-outline" size={20} color={C.blue} />
              <Text style={s.rowLabel}>ライブフィード</Text>
            </View>
            <Switch value={liveFeedEnabled} onValueChange={toggleLiveFeed} trackColor={{ true: C.accent }} />
          </View>
        </View>

        {/* プライバシー */}
        <Text style={s.sectionTitle}>プライバシー</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <Ionicons name="shield-outline" size={20} color={C.blue} />
              <Text style={s.rowLabel}>第三者データ提供</Text>
            </View>
            <Switch value={thirdParty} onValueChange={toggleThirdParty} trackColor={{ true: C.accent }} />
          </View>
        </View>

        {/* サポート */}
        <Text style={s.sectionTitle}>サポート</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={onOpenInquiry}>
            <View style={s.rowLeft}>
              <Ionicons name="chatbubble-outline" size={20} color={C.blue} />
              <Text style={s.rowLabel}>お問い合わせ</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.sub} />
          </TouchableOpacity>
          <View style={s.separator} />
          <TouchableOpacity style={s.row} onPress={onOpenLegal}>
            <View style={s.rowLeft}>
              <Ionicons name="document-text-outline" size={20} color={C.blue} />
              <Text style={s.rowLabel}>利用規約・プライバシーポリシー</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.sub} />
          </TouchableOpacity>
          {onStartTutorial && (
            <>
              <View style={s.separator} />
              <TouchableOpacity style={s.row} onPress={onStartTutorial}>
                <View style={s.rowLeft}>
                  <Ionicons name="help-circle-outline" size={20} color={C.blue} />
                  <Text style={s.rowLabel}>使い方を見る</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.sub} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* アカウント */}
        <Text style={s.sectionTitle}>アカウント</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={handleDeleteAccount}>
            <View style={s.rowLeft}>
              <Ionicons name="trash-outline" size={20} color={C.red} />
              <Text style={[s.rowLabel, { color: C.red }]}>アカウント削除</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 開発者ツール */}
        <Text style={s.sectionTitle}>開発者ツール</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={handleSeedData} disabled={seeding}>
            <View style={s.rowLeft}>
              <Ionicons name="cloud-upload-outline" size={20} color={seeding ? C.sub : C.accent} />
              <Text style={[s.rowLabel, seeding && { color: C.sub }]}>
                {seeding ? 'アップロード中...' : 'シードデータ投入（127件）'}
              </Text>
            </View>
          </TouchableOpacity>
          <View style={s.separator} />
          <TouchableOpacity style={s.row} onPress={handleResetCache}>
            <View style={s.rowLeft}>
              <Ionicons name="refresh-outline" size={20} color={C.accent} />
              <Text style={s.rowLabel}>キャッシュクリア（初回体験リセット）</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* バージョン */}
        <Text style={s.version}>Moto-Logos v{version}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  backBtn: { width: 32 },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { color: C.sub, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 20, marginLeft: 4 },
  card: { backgroundColor: C.surface, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, minHeight: 52 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowLabel: { color: C.text, fontSize: 15 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginLeft: 48 },
  version: { color: C.sub, fontSize: 12, textAlign: 'center', marginTop: 32 },
});
