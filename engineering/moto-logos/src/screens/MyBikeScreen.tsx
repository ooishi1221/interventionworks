import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { UserCC } from '../types';
import { Spacing, FontSize } from '../constants/theme';

const SYS_BLUE   = '#0A84FF';
const SYS_GRAY   = '#636366';
const CARD_BG    = '#1C1C1E';
const BORDER_DEF = 'rgba(255,255,255,0.08)';
const BORDER_ACT = SYS_BLUE;

// ─── アイコン定義 ───────────────────────────────────────
type IconDef =
  | { set: 'ion'; name: keyof typeof Ionicons.glyphMap }
  | { set: 'mci'; name: string };

interface CCOption {
  value: UserCC;
  label: string;
  sub: string;
  detail: string;
  ccText: string;
  icon: IconDef;
  iconColor: string;
}

const CC_OPTIONS: CCOption[] = [
  {
    value: 50,
    label: '原付一種',
    sub: '50cc以下',
    detail: '全ての駐輪場（原付専用を含む）が表示されます',
    ccText: '50',
    icon: { set: 'mci', name: 'moped' },   // 小型モペッド
    iconColor: SYS_GRAY,
  },
  {
    value: 125,
    label: '原付二種',
    sub: '51〜125cc',
    detail: '原付専用を除いた125cc対応以上の駐輪場が表示されます',
    ccText: '125',
    icon: { set: 'mci', name: 'scooter' }, // スクーター
    iconColor: '#30D158',
  },
  {
    value: 400,
    label: '普通二輪',
    sub: '126〜400cc',
    detail: '250cc以上対応または制限なしの駐輪場が表示されます',
    ccText: '400',
    icon: { set: 'mci', name: 'motorbike' }, // ネイキッドバイク
    iconColor: SYS_BLUE,
  },
  {
    value: null,
    label: '大型二輪',
    sub: '401cc以上',
    detail: '制限なし（大型車OK）の駐輪場のみ表示されます',
    ccText: '∞',
    icon: { set: 'mci', name: 'motorbike' }, // 大型バイク（サイズ・グローで差別化）
    iconColor: '#FF9F0A',
  },
];

// ─── アイコン描画ヘルパー ────────────────────────────────
function BikeIcon({ icon, size, color }: { icon: IconDef; size: number; color: string }) {
  if (icon.set === 'mci') {
    return <MaterialCommunityIcons name={icon.name as any} size={size} color={color} />;
  }
  return <Ionicons name={icon.name} size={size} color={color} />;
}

// ─── Props ──────────────────────────────────────────────
interface Props {
  userCC: UserCC;
  onChangeCC: (cc: UserCC) => void;
}

export function MyBikeScreen({ userCC, onChangeCC }: Props) {
  const current = CC_OPTIONS.find((o) => o.value === userCC) ?? CC_OPTIONS[1];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* ヘッダー */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <MaterialCommunityIcons name="scooter" size={28} color={SYS_BLUE} />
          </View>
          <View>
            <Text style={styles.title}>マイバイク設定</Text>
            <Text style={styles.subtitle}>排気量を選ぶと地図の駐輪場が絞り込まれます</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>あなたのバイクの排気量</Text>

        {/* 選択カード一覧 */}
        <View style={styles.optionList}>
          {CC_OPTIONS.map((opt) => {
            const isActive = userCC === opt.value;
            return (
              <TouchableOpacity
                key={String(opt.value)}
                style={[styles.optionBtn, isActive && styles.optionBtnActive]}
                onPress={() => onChangeCC(opt.value)}
                activeOpacity={0.75}
              >
                {/* アイコンボックス */}
                <View style={[styles.iconBox, isActive && styles.iconBoxActive]}>
                  <BikeIcon
                    icon={opt.icon}
                    size={isActive ? 26 : 22}
                    color={isActive ? opt.iconColor : SYS_GRAY}
                  />
                  <Text style={[styles.iconCC, isActive && { color: opt.iconColor }]}>
                    {opt.ccText}
                  </Text>
                </View>

                {/* テキスト */}
                <View style={styles.optionText}>
                  <Text style={[styles.optionLabel, isActive && { color: opt.iconColor }]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.optionSub}>{opt.sub}</Text>
                </View>

                {/* ラジオボタン */}
                <View style={[styles.radio, isActive && { borderColor: opt.iconColor, borderWidth: 1.5 }]}>
                  {isActive && <View style={[styles.radioDot, { backgroundColor: opt.iconColor }]} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 現在の設定カード */}
        <View style={[styles.infoCard, { borderColor: `${current.iconColor}55` }]}>
          <Text style={styles.infoTitle}>現在の設定</Text>
          <View style={styles.infoBody}>
            <BikeIcon icon={current.icon} size={22} color={current.iconColor} />
            <View>
              <Text style={[styles.infoCC, { color: current.iconColor }]}>
                {current.label}（{current.sub}）
              </Text>
              <Text style={styles.infoDetail}>{current.detail}</Text>
            </View>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#000' },
  container: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxl },

  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingTop: Spacing.md },
  headerIcon: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: 'rgba(10,132,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  title:    { color: '#F2F2F7', fontSize: FontSize.xl, fontWeight: '700' },
  subtitle: { color: SYS_GRAY, fontSize: FontSize.sm, marginTop: 2 },

  sectionLabel: {
    color: SYS_GRAY, fontSize: 11, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 1,
  },

  optionList: { gap: Spacing.sm },
  optionBtn: {
    minHeight: 72,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER_DEF,
  },
  optionBtnActive: {
    backgroundColor: 'rgba(10,132,255,0.06)',
    borderColor: BORDER_ACT,
    borderWidth: 1,
  },

  iconBox: {
    width: 52, height: 52, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER_DEF,
    flexShrink: 0,
  },
  iconBoxActive: {
    backgroundColor: 'rgba(10,132,255,0.10)',
    borderColor: 'rgba(10,132,255,0.3)',
  },
  iconCC: { color: SYS_GRAY, fontSize: 9, fontWeight: '700', marginTop: 1 },

  optionText:  { flex: 1, gap: 2 },
  optionLabel: { color: '#F2F2F7', fontSize: FontSize.md, fontWeight: '600' },
  optionSub:   { color: SYS_GRAY, fontSize: FontSize.sm },

  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  radioDot: { width: 12, height: 12, borderRadius: 6 },

  infoCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: Spacing.lg,
    gap: Spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
  },
  infoTitle: {
    color: SYS_GRAY, fontSize: 11, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 1,
  },
  infoBody:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4 },
  infoCC:     { fontSize: FontSize.md, fontWeight: '700' },
  infoDetail: { color: SYS_GRAY, fontSize: FontSize.sm, marginTop: 2, lineHeight: 18 },
});
