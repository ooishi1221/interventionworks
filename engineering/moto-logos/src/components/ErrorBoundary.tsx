/**
 * ErrorBoundary — Moto-Logos
 *
 * React のレンダリングエラーを捕捉し、Sentry に報告する。
 * クラッシュ時はユーザーにリカバリーUIを表示する。
 */
import { Component, type ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { captureError } from '../utils/sentry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    captureError(error, {
      component: 'ErrorBoundary',
      componentStack: errorInfo.componentStack ?? 'unknown',
    });
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Ionicons name="warning-outline" size={56} color="#FF6B00" />
          <Text style={styles.title}>予期しないエラーが発生しました</Text>
          <Text style={styles.message}>
            エラー情報は自動的に送信されました。{'\n'}
            問題が続く場合はアプリを再起動してください。
          </Text>
          {__DEV__ && this.state.error && (
            <Text style={styles.debug}>{this.state.error.message}</Text>
          )}
          <TouchableOpacity
            style={styles.retryButton}
            onPress={this.handleRetry}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh-outline" size={20} color="#F5F5F5" />
            <Text style={styles.retryText}>再試行</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  title: {
    color: '#F5F5F5',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
  message: {
    color: '#A0A0A0',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  debug: {
    color: '#FF453A',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FF6B00',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
    // グローブ対応: 最小タップ領域確保
    minHeight: 52,
    minWidth: 140,
    justifyContent: 'center',
  },
  retryText: {
    color: '#F5F5F5',
    fontSize: 16,
    fontWeight: '600',
  },
});
