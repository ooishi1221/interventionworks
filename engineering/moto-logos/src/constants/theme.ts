/**
 * アプリ全体のカラー定数（#92 一元化）
 *
 * 命名規則:
 *   bg / sheet / surface / card / cardElevated — 背景の階層
 *   text / sub — テキスト
 *   accent / blue / green / red / orange / purple / pink / yellow — セマンティックカラー
 *   border / hairline — 区切り線
 *
 * LegalScreen 系の旧テーマ値は legal* プレフィックスで保持
 */
export const Colors = {
  // ── 背景・サーフェス ──────────────────────────────
  bg:            '#000000',        // メイン背景（大多数の画面）
  sheet:         '#1C1C1E',        // ボトムシート・モーダル背景
  surface:       '#1C1C1E',        // sheet と同値（Settings / Notifications 等）
  card:          '#1C1C1E',        // 一次カード背景
  cardElevated:  '#2C2C2E',        // 二次カード（SpotDetailSheet / ProximityContextCard）

  // ── テキスト ──────────────────────────────────────
  text:          '#F2F2F7',
  sub:           '#8E8E93',

  // ── アクセント・セマンティック ────────────────────
  accent:        '#FF6B00',        // ブランドオレンジ
  blue:          '#0A84FF',
  green:         '#30D158',
  red:           '#FF453A',
  orange:        '#FF9F0A',
  purple:        '#BF5AF2',
  pink:          '#FF375F',
  yellow:        '#FFD60A',

  // ── ボーダー ──────────────────────────────────────
  border:        'rgba(255,255,255,0.10)',
  hairline:      'rgba(255,255,255,0.08)',

  // ── 汎用 ─────────────────────────────────────────
  white:         '#FFFFFF',

  // ── 旧テーマ（LegalScreen 等で使用） ─────────────
  legalBg:       '#0D0D0D',
  legalSurface:  '#1A1A1A',
  legalCard:     '#242424',
  legalText:     '#F5F5F5',
  legalSub:      '#A0A0A0',
  legalBorder:   '#333333',

  // ── 旧テーマ互換（theme.ts の元の名前） ──────────
  background:    '#0D0D0D',
  accentLight:   '#FF8C33',
  textSecondary: '#A0A0A0',
  success:       '#4CAF50',
  danger:        '#F44336',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// グローブでも押せる巨大ボタン用
export const ButtonSize = {
  giant: 80,
  large: 64,
  normal: 52,
} as const;

export const FontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 16,
  lg: 24,
  full: 9999,
} as const;
