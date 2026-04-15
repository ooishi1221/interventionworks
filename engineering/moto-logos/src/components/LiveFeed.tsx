/**
 * LiveFeed — マップ上部を横断するティッカー
 *
 * 報告タイプ別カラーで「何が起きたか」を瞬時に伝える。
 * 緑=停められた / 赤=満車 / グレー=閉鎖 / 黄=料金 / オレンジ=CC制限 / 紫=新規登録
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_W } = Dimensions.get('window');

// ── 報告タイプ別カラー ──────────────────────────────────
const TYPE = {
  good:      { color: '#30D158', icon: 'thumbs-up'       as const },  // 停められた
  full:      { color: '#FF453A', icon: 'alert-circle'    as const },  // 満車
  closed:    { color: '#636366', icon: 'close-circle'    as const },  // 閉鎖
  wrongPrice:{ color: '#FFD60A', icon: 'cash-outline'    as const },  // 料金違う
  wrongCC:   { color: '#FF9F0A', icon: 'speedometer-outline' as const }, // CC制限違う
  register:  { color: '#BF5AF2', icon: 'location'        as const },  // 新規登録
};

interface FeedItem {
  id: string;
  type: keyof typeof TYPE;
  message: string;
  time: string;
}

const DUMMY_FEED: FeedItem[] = [
  { id: '1', type: 'register',  message: 'CBR650Rのライダーが渋谷駅前を発見',          time: '2分前' },
  { id: '2', type: 'good',      message: 'PCX150で北千住駅東口に停めた',               time: '5分前' },
  { id: '3', type: 'register',  message: 'MT-07のライダーが新宿西口を発見',            time: '8分前' },
  { id: '4', type: 'full',      message: 'Ninja400で赤羽駅東口「満車」',               time: '12分前' },
  { id: '5', type: 'good',      message: 'レブル250で池袋サンシャイン前に停めた',        time: '15分前' },
  { id: '6', type: 'closed',    message: '上野駅前バイク駐車場「閉鎖」',                time: '18分前' },
  { id: '7', type: 'good',      message: 'YZF-R25で秋葉原UDX前に停めた',              time: '22分前' },
  { id: '8', type: 'register',  message: 'GB350のライダーが横浜みなとみらいを発見',       time: '25分前' },
  { id: '9', type: 'wrongPrice', message: '品川駅東口「料金が違った」',                  time: '28分前' },
  { id: '10', type: 'wrongCC',   message: '六本木交差点「CC制限が違った」',              time: '32分前' },
];

const SLIDE_DURATION = 500;
const DISPLAY_DURATION = 5000;

export function LiveFeed() {
  const [index, setIndex] = useState(0);
  const translateY = useRef(new Animated.Value(-80)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;

    const showNext = () => {
      if (!mounted) return;
      translateY.setValue(-80);
      Animated.spring(translateY, {
        toValue: 0,
        tension: 120,
        friction: 12,
        useNativeDriver: true,
      }).start(() => {
        if (!mounted) return;
        timerRef.current = setTimeout(() => {
          if (!mounted) return;
          Animated.timing(translateY, {
            toValue: -80,
            duration: 300,
            useNativeDriver: true,
          }).start(() => {
            if (!mounted) return;
            setIndex((i) => (i + 1) % DUMMY_FEED.length);
            showNext();
          });
        }, DISPLAY_DURATION);
      });
    };

    showNext();
    return () => {
      mounted = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const item = DUMMY_FEED[index];
  const t = TYPE[item.type];

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Animated.View style={[styles.bar, { borderLeftColor: t.color, transform: [{ translateY }] }]}>
        <View style={[styles.dot, { backgroundColor: t.color }]}>
          <Ionicons name={t.icon} size={11} color="#fff" />
        </View>
        <Text style={styles.message} numberOfLines={1}>{item.message}</Text>
        <Text style={styles.time}>{item.time}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 116,
    left: 0,
    right: 0,
    zIndex: 15,
    overflow: 'hidden',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 10,
    backgroundColor: 'rgba(28,28,30,0.88)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    // 左ボーダーで報告タイプを色分け
    borderLeftWidth: 3,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    color: '#F2F2F7',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  time: {
    color: '#636366',
    fontSize: 10,
    fontWeight: '500',
  },
});
