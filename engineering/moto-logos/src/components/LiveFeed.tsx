/**
 * LiveFeed — マップ上部を横断するティッカー
 *
 * 右から左へスライドして次々と活動が流れる。
 * 「このアプリには人がいる」を体感させる。
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_W } = Dimensions.get('window');

const C = {
  text:   '#F2F2F7',
  sub:    '#636366',
  green:  '#30D158',
  purple: '#BF5AF2',
  orange: '#FF9F0A',
};

interface FeedItem {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  message: string;
  time: string;
}

const DUMMY_FEED: FeedItem[] = [
  { id: '1', icon: 'location',    color: C.purple, message: 'ライダーが渋谷駅前を登録',         time: '2分前' },
  { id: '2', icon: 'thumbs-up',   color: C.green,  message: '北千住駅東口「停められた」',       time: '5分前' },
  { id: '3', icon: 'location',    color: C.purple, message: 'ライダーが新宿西口を登録',         time: '8分前' },
  { id: '4', icon: 'thumbs-down', color: C.orange, message: '赤羽駅東口「満車だった」',        time: '12分前' },
  { id: '5', icon: 'thumbs-up',   color: C.green,  message: '池袋サンシャイン前「停められた」', time: '15分前' },
  { id: '6', icon: 'location',    color: C.purple, message: 'ライダーが上野駅前を登録',         time: '18分前' },
  { id: '7', icon: 'thumbs-up',   color: C.green,  message: '秋葉原UDX前「停められた」',       time: '22分前' },
  { id: '8', icon: 'location',    color: C.purple, message: 'ライダーが横浜みなとみらいを登録', time: '25分前' },
];

const SLIDE_DURATION = 500;
const DISPLAY_DURATION = 3000;

export function LiveFeed() {
  const [index, setIndex] = useState(0);
  const translateX = useRef(new Animated.Value(SCREEN_W)).current;

  useEffect(() => {
    let mounted = true;

    const showNext = () => {
      if (!mounted) return;
      // 右から入ってくる
      translateX.setValue(SCREEN_W);
      Animated.timing(translateX, {
        toValue: 0,
        duration: SLIDE_DURATION,
        useNativeDriver: true,
      }).start(() => {
        if (!mounted) return;
        // 表示して待つ → 左へ出ていく
        setTimeout(() => {
          if (!mounted) return;
          Animated.timing(translateX, {
            toValue: -SCREEN_W,
            duration: SLIDE_DURATION,
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
    return () => { mounted = false; };
  }, []);

  const item = DUMMY_FEED[index];

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Animated.View style={[styles.bar, { transform: [{ translateX }] }]}>
        <View style={[styles.dot, { backgroundColor: item.color }]}>
          <Ionicons name={item.icon} size={11} color="#fff" />
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
    top: 52,
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
