import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UserCC } from '../types';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';

const SYS_BLUE    = '#0A84FF';
const SYS_GRAY    = '#636366';
const CARD_BG     = '#1C1C1E';
const CARD_BG_ACTIVE = 'rgba(10,132,255,0.08)';
const BORDER_DEFAULT = 'rgba(255,255,255,0.10)';
const BORDER_ACTIVE  = SYS_BLUE;

const CC_OPTIONS: {
  value: UserCC;
  label: string;
  sub: string;
  detail: string;
}[] = [
  {
    value: 50,
    label: '原付',
    sub: '50cc以下',
    detail: '原付のみ可を含む全施設が表示されます',
  },
  {
    value: 125,
    label: '125cc',
    sub: '小型二輪',
    detail: '125cc以下可の施設が表示されます',
  },
  {
    value: 250,
    label: '250cc',
    sub: '軽二輪',
    detail: '250cc以下可の施設が表示されます',
  },
  {
    value: 400,
    label: '400cc以上',
    sub: '普通二輪・大型',
    detail: '制限なしの施設のみ表示されます',
  },
];

/** 排気量を示すアイコンボックス（線画風・統一感） */
function CCIcon({ value, active }: { value: UserCC; active: boolean }) {
  return (
    <View style={[iconStyles.box, active && iconStyles.boxActive]}>
      <Text style={[iconStyles.label, active && iconStyles.labelActive]}>
        {value === 400 ? '400\n+' : String(value)}
      </Text>
      <Text style={[iconStyles.unit, active && iconStyles.unitActive]}>cc</Text>
    </View>
  );
}

interface Props {
  userCC: UserCC;
  onChangeCC: (cc: UserCC) => void;
}

export function MyBikeScreen({ userCC, onChangeCC }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Ionicons name="bicycle-outline" size={32} color={SYS_BLUE} />
          <View>
            <Text style={styles.title}>マイバイク設定</Text>
            <Text style={styles.subtitle}>排気量を選ぶと、地図の駐輪場が絞り込まれます</Text>
          </View>
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
                <CCIcon value={opt.value} active={isActive} />
                <View style={styles.optionText}>
                  <Text style={[styles.optionLabel, isActive && styles.optionLabelActive]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.optionSub}>{opt.sub}</Text>
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
                <Text style={styles.infoCC}>{opt.label}（{opt.sub}）</Text>
                <Text style={styles.infoDetail}>{opt.detail}</Text>
              </>
            );
          })()}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const iconStyles = StyleSheet.create({
  box: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER_DEFAULT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    flexShrink: 0,
  },
  boxActive: {
    borderColor: SYS_BLUE,
    backgroundColor: 'rgba(10,132,255,0.15)',
  },
  label: {
    color: SYS_GRAY,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 15,
    letterSpacing: -0.5,
  },
  labelActive: {
    color: SYS_BLUE,
  },
  unit: {
    color: SYS_GRAY,
    fontSize: 9,
    fontWeight: '500',
  },
  unitActive: {
    color: SYS_BLUE,
  },
});

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#000',
  },
  container: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.md,
  },
  title: {
    color: '#F5F5F5',
    fontSize: FontSize.xl,
    fontWeight: '700',
  },
  subtitle: {
    color: SYS_GRAY,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  sectionLabel: {
    color: SYS_GRAY,
    fontSize: FontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  optionList: {
    gap: Spacing.sm,
  },
  optionBtn: {
    minHeight: 72,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER_DEFAULT,
  },
  optionBtnActive: {
    backgroundColor: CARD_BG_ACTIVE,
    borderColor: BORDER_ACTIVE,
    borderWidth: 1,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    color: '#F5F5F5',
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  optionLabelActive: {
    color: SYS_BLUE,
  },
  optionSub: {
    color: SYS_GRAY,
    fontSize: FontSize.sm,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioActive: {
    borderColor: SYS_BLUE,
    borderWidth: 1.5,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: SYS_BLUE,
  },
  infoCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: Spacing.lg,
    gap: Spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(10,132,255,0.35)',
  },
  infoTitle: {
    color: SYS_GRAY,
    fontSize: FontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infoCC: {
    color: SYS_BLUE,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  infoDetail: {
    color: SYS_GRAY,
    fontSize: FontSize.sm,
  },
});
