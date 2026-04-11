export const Colors = {
  background: '#0D0D0D',
  surface: '#1A1A1A',
  card: '#242424',
  accent: '#FF6B00',       // オレンジ
  accentLight: '#FF8C33',
  text: '#F5F5F5',
  textSecondary: '#A0A0A0',
  border: '#333333',
  success: '#4CAF50',
  danger: '#F44336',
  white: '#FFFFFF',
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
