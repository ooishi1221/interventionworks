/**
 * SearchResultsList — サーチタブ押下時に表示するフローティング最寄りリスト
 *
 * - 最寄り3件を常に展開状態で表示
 * - エリアサマリーモード（テキスト検索後: 「渋谷 — N件」+ ×クリア）
 * - スポットタップ → onSpotPress
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
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
}

export function SearchResultsList({ items, areaName, onSpotPress, onClear }: Props) {
  const tutorial = useTutorial();
  const firstCardRef = useRef<View>(null);

  // チュートリアル explore-result で最初のカードを target として登録。
  // onLayout → measureInWindow で render 完了直後の正確な座標を取得。
  useEffect(() => {
    if (!tutorial.active || tutorial.currentStep.id !== 'explore-result') return;
    if (items.length === 0) return;
    const register = () => {
      firstCardRef.current?.measureInWindow((x, y, w, h) => {
        if (w > 0 && h > 0) {
          tutorial.registerTarget('search-result-card', {
            x: x - 4,
            y: y - 4,
            w: w + 8,
            h: h + 8,
            borderRadius: 14,
          });
        }
      });
    };
    // レイアウト確定のためマイクロウェイト
    const t1 = setTimeout(register, 100);
    const t2 = setTimeout(register, 400); // 念のため再測定
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [tutorial.active, tutorial.currentStep.id, items.length]);

  if (items.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.card}>
        {/* ヘッダー */}
        <View style={styles.header}>
          {areaName ? (
            <Text style={styles.areaName} numberOfLines={1}>{areaName}</Text>
          ) : (
            <Text style={styles.title}>近くのスポット</Text>
          )}
          <TouchableOpacity onPress={onClear} style={styles.clearBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={14} color={C.sub} />
          </TouchableOpacity>
        </View>

        {/* リスト */}
        {items.map((item, idx) => {
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
                // onLayout 発火でも再測定 (maps が非同期で動く場合のラグ対策)
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
                {price && <Text style={styles.price}>{price}</Text>}
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
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
    marginBottom: 2,
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
    flex: 1,
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
    color: C.accent,
    fontSize: 14,
    fontWeight: '700',
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
