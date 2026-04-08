import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { UserCC } from '../types';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

const CC_OPTIONS: {
  value: UserCC;
  label: string;
  sub: string;
  detail: string;
  icon: string;
}[] = [
  {
    value: 50,
    label: '原付',
    sub: '50cc以下',
    detail: '原付のみ可を含む全施設が表示されます',
    icon: '🛵',
  },
  {
    value: 125,
    label: '125cc',
    sub: '小型二輪',
    detail: '125cc以下可の施設が表示されます',
    icon: '🏍️',
  },
  {
    value: 250,
    label: '250cc',
    sub: '軽二輪',
    detail: '250cc以下可の施設が表示されます',
    icon: '🏍️',
  },
  {
    value: 400,
    label: '400cc以上',
    sub: '普通二輪・大型',
    detail: '制限なしの施設のみ表示されます',
    icon: '🏍️',
  },
];

interface Props {
  userCC: UserCC;
  onChangeCC: (cc: UserCC) => void;
}

export function MyBikeScreen({ userCC, onChangeCC }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>マイバイク設定</Text>
          <Text style={styles.subtitle}>
            排気量を選ぶと、地図に表示される駐輪場が絞り込まれます
          </Text>
        </View>

        <Text style={styles.sectionLabel}>あなたのバイクの排気量</Text>

        <View style={styles.optionList}>
          {CC_OPTIONS.map((opt) => {
            const isActive = userCC === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.optionBtn, isActive && styles.optionBtnActive]}
                onPress={() => onChangeCC(opt.value)}
                activeOpacity={0.75}
              >
                <Text style={styles.optionIcon}>{opt.icon}</Text>
                <View style={styles.optionText}>
                  <Text style={[styles.optionLabel, isActive && styles.optionLabelActive]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.optionSub, isActive && styles.optionSubActive]}>
                    {opt.sub}
                  </Text>
                </View>
                <View style={[styles.radio, isActive && styles.radioActive]}>
                  {isActive && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>現在の設定</Text>
          {(() => {
            const opt = CC_OPTIONS.find((o) => o.value === userCC)!;
            return (
              <>
                <Text style={styles.infoCC}>
                  {opt.icon} {opt.label}（{opt.sub}）
                </Text>
                <Text style={styles.infoDetail}>{opt.detail}</Text>
              </>
            );
          })()}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function LegendRow({
  color,
  label,
  detail,
}: {
  color: string;
  label: string;
  detail: string;
}) {
  return (
    <View style={legendStyles.row}>
      <View style={[legendStyles.dot, { backgroundColor: color }]} />
      <View>
        <Text style={legendStyles.label}>{label}</Text>
        <Text style={legendStyles.detail}>{detail}</Text>
      </View>
    </View>
  );
}

const legendStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    flexShrink: 0,
  },
  label: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  detail: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
  },
});

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  header: {
    gap: Spacing.xs,
    paddingTop: Spacing.md,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  optionList: {
    gap: Spacing.sm,
  },
  // グローブ対応：最小タップ高 80px
  optionBtn: {
    minHeight: 80,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  optionBtnActive: {
    backgroundColor: 'rgba(255,107,0,0.12)',
    borderColor: Colors.accent,
  },
  optionIcon: {
    fontSize: 28,
    width: 36,
    textAlign: 'center',
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  optionLabelActive: {
    color: Colors.accent,
  },
  optionSub: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  optionSubActive: {
    color: Colors.accentLight,
  },
  radio: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioActive: {
    borderColor: Colors.accent,
  },
  radioDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.accent,
  },
  infoCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  infoTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infoCC: {
    color: Colors.accent,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  infoDetail: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  legendCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  legendTitle: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
});
