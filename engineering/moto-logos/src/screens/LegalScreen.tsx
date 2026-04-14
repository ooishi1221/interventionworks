import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';

const THIRD_PARTY_CONSENT_KEY = 'moto_logos_third_party_consent';
const CONTACT_EMAIL = process.env.EXPO_PUBLIC_CONTACT_EMAIL || 'yuji.ooishi@intervention.jp';

import { Colors } from '../constants/theme';

const C = {
  bg: Colors.legalBg,
  surface: Colors.legalSurface,
  card: Colors.legalCard,
  accent: Colors.accent,
  text: Colors.legalText,
  sub: Colors.legalSub,
  border: Colors.legalBorder,
};

type DocType = 'terms' | 'privacy' | 'moderation';

const DOC_TITLES: Record<DocType, string> = {
  terms: '利用規約',
  privacy: 'プライバシーポリシー',
  moderation: 'モデレーションポリシー',
};

interface Props {
  onAccept?: () => void;
  onBack?: () => void;
  /** 同意モード（初回起動時）か閲覧モード（設定から）か */
  mode: 'consent' | 'view';
  /** 閲覧モードで初期表示するドキュメント */
  initialDoc?: DocType;
}

export function LegalScreen({ onAccept, onBack, mode, initialDoc }: Props) {
  const [activeDoc, setActiveDoc] = useState<DocType>(initialDoc ?? 'terms');
  const [content, setContent] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [agreed, setAgreed] = useState<Record<string, boolean>>({
    terms: false,
    privacy: false,
    moderation: false,
    thirdParty: false,
  });

  useEffect(() => {
    loadDocuments();
  }, []);

  async function loadDocuments() {
    try {
      const docs: Record<string, string> = {};
      // Markdown ファイルを読み込む
      const files: Record<DocType, number> = {
        terms: require('../../assets/legal/terms-of-service.md'),
        privacy: require('../../assets/legal/privacy-policy.md'),
        moderation: require('../../assets/legal/moderation-policy.md'),
      };

      for (const [key, asset] of Object.entries(files)) {
        const resolved = Asset.fromModule(asset);
        await resolved.downloadAsync();
        // localUri は Android Expo Go で null になることがあるため
        // fetch() で確実に読み込む
        const uri = resolved.localUri || resolved.uri;
        if (uri) {
          const res = await fetch(uri);
          docs[key] = await res.text();
        }
      }
      setContent(docs);
    } catch (e) {
      console.warn('[LegalScreen] failed to load docs:', e);
    } finally {
      setLoading(false);
    }
  }

  const allAgreed = agreed.terms && agreed.privacy;
  const canAccept = mode === 'consent' ? allAgreed : true;

  function renderMarkdownSimple(md: string) {
    // 簡易 Markdown → Text 変換（ヘッダー、箇条書き、太字）
    return md.split('\n').map((line, i) => {
      if (line.startsWith('# ')) {
        return <Text key={i} style={s.h1}>{line.replace(/^# /, '')}</Text>;
      }
      if (line.startsWith('## ')) {
        return <Text key={i} style={s.h2}>{line.replace(/^## /, '')}</Text>;
      }
      if (line.startsWith('### ')) {
        return <Text key={i} style={s.h3}>{line.replace(/^### /, '')}</Text>;
      }
      if (line.startsWith('- ')) {
        return <Text key={i} style={s.li}>  {'\u2022'} {line.replace(/^- /, '')}</Text>;
      }
      if (line.startsWith('---')) {
        return <View key={i} style={s.hr} />;
      }
      if (line.trim() === '') {
        return <View key={i} style={{ height: 8 }} />;
      }
      // 太字
      const parts = line.split(/\*\*(.*?)\*\*/g);
      if (parts.length > 1) {
        return (
          <Text key={i} style={s.body}>
            {parts.map((p, j) => j % 2 === 1 ? <Text key={j} style={s.bold}>{p}</Text> : p)}
          </Text>
        );
      }
      return <Text key={i} style={s.body}>{line}</Text>;
    });
  }

  return (
    <SafeAreaView style={s.container}>
      {/* ヘッダー */}
      <View style={s.header}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Ionicons name="chevron-back" size={24} color={C.text} />
          </TouchableOpacity>
        )}
        <Text style={s.headerTitle}>
          {mode === 'consent' ? '利用規約への同意' : DOC_TITLES[activeDoc]}
        </Text>
      </View>

      {/* タブ */}
      <View style={s.tabRow}>
        {(['terms', 'privacy', 'moderation'] as DocType[]).map((doc) => (
          <TouchableOpacity
            key={doc}
            style={[s.tab, activeDoc === doc && s.tabActive]}
            onPress={() => setActiveDoc(doc)}
          >
            <Text style={[s.tabText, activeDoc === doc && s.tabTextActive]}>
              {DOC_TITLES[doc]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* コンテンツ */}
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
        ) : content[activeDoc] ? (
          renderMarkdownSimple(content[activeDoc])
        ) : (
          <Text style={s.body}>ドキュメントを読み込めませんでした</Text>
        )}
      </ScrollView>

      {/* 同意チェックボックス（consent モードのみ） */}
      {mode === 'consent' && (
        <View style={s.footer}>
          <TouchableOpacity
            style={s.checkRow}
            onPress={() => setAgreed((p) => ({ ...p, terms: !p.terms }))}
          >
            <Ionicons
              name={agreed.terms ? 'checkbox' : 'square-outline'}
              size={24}
              color={agreed.terms ? C.accent : C.sub}
            />
            <Text style={s.checkText}>利用規約に同意する</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.checkRow}
            onPress={() => setAgreed((p) => ({ ...p, privacy: !p.privacy }))}
          >
            <Ionicons
              name={agreed.privacy ? 'checkbox' : 'square-outline'}
              size={24}
              color={agreed.privacy ? C.accent : C.sub}
            />
            <Text style={s.checkText}>プライバシーポリシーに同意する</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.checkRow}
            onPress={() => setAgreed((p) => ({ ...p, thirdParty: !p.thirdParty }))}
          >
            <Ionicons
              name={agreed.thirdParty ? 'checkbox' : 'square-outline'}
              size={24}
              color={agreed.thirdParty ? C.accent : C.sub}
            />
            <Text style={s.checkText}>第三者へのデータ提供に同意する（任意）</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.acceptBtn, !canAccept && s.acceptBtnDisabled]}
            onPress={canAccept ? () => {
              AsyncStorage.setItem(THIRD_PARTY_CONSENT_KEY, agreed.thirdParty ? 'true' : 'false');
              onAccept?.();
            } : undefined}
            disabled={!canAccept}
          >
            <Text style={s.acceptBtnText}>同意して始める</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=お問い合わせ`)}
          >
            <Text style={s.contactLink}>お問い合わせ: {CONTACT_EMAIL}</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  backBtn: { marginRight: 8 },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: C.accent,
  },
  tabText: { color: C.sub, fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: C.accent, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  h1: { color: C.text, fontSize: 20, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  h2: { color: C.text, fontSize: 17, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  h3: { color: C.text, fontSize: 15, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  body: { color: C.sub, fontSize: 14, lineHeight: 22 },
  bold: { color: C.text, fontWeight: '700' },
  li: { color: C.sub, fontSize: 14, lineHeight: 22, paddingLeft: 8 },
  hr: { height: 1, backgroundColor: C.border, marginVertical: 12 },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    backgroundColor: C.surface,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    minHeight: 52,
  },
  checkText: { color: C.text, fontSize: 15 },
  acceptBtn: {
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    minHeight: 52,
  },
  acceptBtnDisabled: { opacity: 0.4 },
  acceptBtnText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  contactLink: {
    color: C.sub,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    textDecorationLine: 'underline',
  },
});
