import { Platform } from 'react-native';

export const C = {
  // Core brutalist palette
  bg:           '#000000',
  surface:      '#0F0F0F',
  surfaceHigh:  '#1A1A1A',
  border:       '#2A2A2A',
  borderBright: '#3A3A3A',

  // Accent
  orange:       '#FF3D00',
  orangeDim:    '#CC3100',
  orangeGhost:  '#FF3D0018',

  // Text
  white:        '#FFFFFF',
  textPrimary:  '#FFFFFF',
  textSecondary:'#888888',
  textDim:      '#444444',

  // Status
  green:        '#00FF85',
  greenGhost:   '#00FF8518',
  red:          '#FF3D3D',
  redGhost:     '#FF3D3D18',
  amber:        '#FFB800',
  amberGhost:   '#FFB80018',
  blue:         '#0094FF',

  // Borders
  BORDER_W:     1.5,
};

export const FONT = {
  mono:     Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  sans:     Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
  sansBold: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif-medium',
};

export const S = {
  // Common spacing
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,

  // Border radius — brutalist = 0
  radius: 0,

  // Tap target minimum
  tapMin: 48,
};
