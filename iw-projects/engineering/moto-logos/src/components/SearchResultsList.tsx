/**
 * SearchResultsList — サーチタブ押下時に表示するフローティング最寄りリスト
 *
 * - 最寄り3件を常に展開状態で表示
 * - エリアサマリーモード（テキスト検索後: 「渋谷 — N件」+ ×クリア）
 * - スポットタップ → onSpotPress
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  LayoutAnimation,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ParkingPin } from '../types';
import { Colors } from '../constants/theme';
import { spotFreshness, freshnessLabel, FRESHNESS_STYLE } from '../utils/freshness';
import { useTutorial } from '../contexts/TutorialContext';

const C = Colors;

function fmtDist(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

function FreshDot({ spot }: { spot: ParkingPin }) {
  const fresh = spotFreshness(spot);
  const { color, opacity } = FRESHNESS_STYLE[fresh];
  return <View style={[styles.freshDot, { backgroundColor: color, opacity }]} />;
}

interface Props {
  items: { spot: ParkingPin; distanceM: number }[];
  areaName?: string | null;
  onSpotPress?: (spot: ParkingPin) => void;
  onClear?: () => void;
  /** 案内中バナー表示時に下にずらす追加オフセット */
  topOffset?: number;
}

export function SearchResultsList({ items, areaName, onSpotPress, onClear, topOffset }: Props) {
  const tutorial = useTutorial();
  const firstCardRef = useRef<View>(null);
  const [collapsed, setCollapsed] = useState(false);

  // アイテムが変わったら展開に戻す（新しい検索結果）
  useEffect(() => { setCollapsed(false); }, [items]);

  // チュートリアル explore-result で最初のカードを target として登録。
  useEffect(() => {
    if (!tutorial.active || tutorial.currentStep.id !== 'explore-result') return;
    if (items.length === 0) return;
    const register = () => {
      firstCardRef.current?.measureInWindow((x, y, w, h) => {
        if (w > 0 && h > 0) {
          tutorial.registerTarget('search-result-card', {
            x: x - 4, y: y - 4, w: w + 8, h: h + 8, borderRadius: 14,
          });
        }
      });
    };
    const t1 = setTimeout(register, 100);
    const t2 = setTimeout(register, 400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [tutorial.active, tutorial.currentStep.id, items.length]);

  if (items.length === 0) return null;

  const toggleCollapse = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((prev) => !prev);
  };

  return (
    <View style={[styles.container, topOffset ? { top: (Platform.OS === 'ios' ? 60 : 40) + topOffset } : undefined]} pointerEvents="box-none">
      <View style={styles.card}>
        {/* ヘッダー（タップで折り畳み） */}
        <TouchableOpacity style={styles.header} onPress={toggleCollapse} activeOpacity={0.7}>
          <View style={styles.headerLeft}>
            {areaName ? (
              <Text style={styles.areaName} numberOfLines={1}>{areaName}</Text>
            ) : (
              <Text style={styles.title}>近くのスポット</Text>
            )}
            <Text style={styles.countBadge}>{items.length}件</Text>
            <Ionicons
              name={collapsed ? 'chevron-down' : 'chevron-up'}
              size={14}
              color={C.sub}
            />
          </View>
          <TouchableOpacity onPress={onClear} style={styles.clearBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={14} color={C.sub} />
          </TouchableOpacity>
        </TouchableOpacity>

        {/* リスト（折り畳み時は非表示） */}
        {!collapsed && items.map((item, idx) => {
          const { spot } = item;
          const price = spot.isFree ? '無料' : spot.priceInfo ? spot.priceInfo : spot.pricePerHour ? `¥${spot.pricePerHour}/h` : null;
          const cap = spot.capacity ? `${spot.capacity}台` : null;
          return (
            <TouchableOpacity
              key={spot.id}
              ref={idx === 0 ? firstCardRef : undefined}
              style={styles.row}
              onPress={() => onSpotPress?.(spot)}
              activeOpacity={0.7}
              onLayout={idx === 0 ? () => {
                if (tutorial.active && tutorial.currentStep.id === 'explore-result') {
                  firstCardRef.current?.measureInWindow((x, y, w, h) => {
                    if (w > 0 && h > 0) {
                      tutorial.registerTarget('search-result-card', {
                        x: x - 4, y: y - 4, w: w + 8, h: h + 8, borderRadius: 14,
                      });
                    }
                  });
                }
              } : undefined}
            >
              <View style={styles.rowTop}>
                <FreshDot spot={spot} />
                <Text style={styles.dist}>{fmtDist(item.distanceM)}</Text>
                {price && (
                  <Text
                    style={styles.price}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {price}
                  </Text>
                )}
                {cap && <Text style={styles.cap}>{cap}</Text>}
              </View>
              <Text style={styles.name} numberOfLines={1}>{spot.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 12,
    right: 12,
    zIndex: 8,
  },
  card: {
    backgroundColor: 'rgba(28,28,30,0.92)',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    // elevation除去（Android重い）
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
    marginBottom: 2,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: C.sub,
    fontSize: 12,
    fontWeight: '600',
  },
  areaName: {
    color: C.text,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  countBadge: {
    color: C.sub,
    fontSize: 11,
    fontWeight: '600',
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    paddingVertical: 10,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  freshDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dist: {
    color: C.text,
    fontSize: 17,
    fontWeight: '800',
  },
  price: {
    flex: 1,
    color: C.accent,
    fontSize: 14,
    fontWeight: '700',
    minWidth: 0, // flex shrink を有効化
  },
  cap: {
    color: C.sub,
    fontSize: 13,
    fontWeight: '600',
  },
  name: {
    color: C.sub,
    fontSize: 12,
    marginLeft: 20,
  },
});
