/**
 * AccountLinkCard — アカウント連携UI
 *
 * 設定画面に配置。Apple / Google でサインインしてアカウントをリンクする。
 * 連携済みならプロバイダー名とサインアウトボタンを表示。
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize } from '../constants/theme';
import { useUser } from '../contexts/UserContext';
import { captureError } from '../utils/sentry';

export function AccountLinkCard() {
  const user = useUser();
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  const handleApple = async () => {
    setLoading(true);
    try {
      await user.linkApple();
      Alert.alert('連携完了', 'Apple アカウントと連携しました。機種変更しても足跡が引き継がれます。');
    } catch (e: unknown) {
      const err = e as { code?: string };
      // ユーザーがキャンセルした場合は無視
      if (err.code === 'ERR_REQUEST_CANCELED' || err.code === '1001') return;
      captureError(e, { context: 'link_apple' });
      const msg = err.code ? `[${err.code}] ` : '';
      Alert.alert('Apple連携に失敗', `${msg}${(e as Error)?.message ?? '不明なエラー'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      await user.linkGoogle();
      Alert.alert('連携完了', 'Google アカウントと連携しました。機種変更しても足跡が引き継がれます。');
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'SIGN_IN_CANCELLED' || err.code === '12501') return;
      captureError(e, { context: 'link_google' });
      const msg = err.code ? `[${err.code}] ` : '';
      Alert.alert('Google連携に失敗', `${msg}${err.message ?? '不明なエラー'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'サインアウト',
      'サインアウトすると、再度サインインするまで足跡データにアクセスできなくなります。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'サインアウト',
          style: 'destructive',
          onPress: async () => {
            try {
              await user.logout();
            } catch (e) {
              captureError(e, { context: 'sign_out' });
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={s.card}>
        <ActivityIndicator color={Colors.accent} size="small" />
        <Text style={s.loadingText}>連携中...</Text>
      </View>
    );
  }

  // 連携済み
  if (user.isLinked) {
    const providerLabel = user.authProvider === 'apple' ? 'Apple' : 'Google';
    const providerIcon = user.authProvider === 'apple' ? 'logo-apple' : 'logo-google';

    return (
      <View style={s.card}>
        <View style={s.linkedRow}>
          <Ionicons name={providerIcon} size={20} color={Colors.text} />
          <Text style={s.linkedText}>{providerLabel} で連携済み</Text>
        </View>
        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
          <Text style={s.signOutText}>サインアウト</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 未連携
  return (
    <View style={s.card}>
      <Text style={s.description}>
        アカウント連携すると、機種変更しても足跡が引き継がれます
      </Text>

      {Platform.OS === 'ios' && (
        <TouchableOpacity style={s.appleBtn} onPress={handleApple}>
          <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
          <Text style={s.appleBtnText}>Apple でサインイン</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={s.googleBtn} onPress={handleGoogle}>
        <Ionicons name="logo-google" size={20} color="#FFFFFF" />
        <Text style={s.googleBtnText}>Google でサインイン</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  description: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
    lineHeight: 20,
  },
  appleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    borderRadius: 10,
    height: 52,
    marginBottom: Spacing.sm,
    gap: 8,
  },
  appleBtnText: {
    color: '#FFFFFF',
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardElevated,
    borderRadius: 10,
    height: 52,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  googleBtnText: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  linkedText: {
    color: Colors.text,
    fontSize: FontSize.md,
  },
  signOutBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  signOutText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
});
