import type { TicketPriority, TicketStatus } from '@/api/schemas';

export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  primary: string;
  primaryPressed: string;
  primaryText: string;
  primarySoft: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  ai: string;
  aiSoft: string;
  inputBackground: string;
  skeleton: string;
}

export const lightColors: ThemeColors = {
  background: '#F6F7FB',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F3F9',
  border: '#E4E7EF',
  borderStrong: '#CBD1DE',
  text: '#0F172A',
  textMuted: '#475569',
  textSubtle: '#64748B',
  primary: '#4F46E5',
  primaryPressed: '#4338CA',
  primaryText: '#FFFFFF',
  primarySoft: '#EEF0FF',
  danger: '#DC2626',
  dangerSoft: '#FEECEC',
  success: '#15803D',
  successSoft: '#E7F7EC',
  warning: '#B45309',
  warningSoft: '#FEF4E2',
  info: '#0369A1',
  infoSoft: '#E5F3FB',
  ai: '#7C3AED',
  aiSoft: '#F4EEFF',
  inputBackground: '#FFFFFF',
  skeleton: '#E7EAF2',
};

export const darkColors: ThemeColors = {
  background: '#0B0F19',
  surface: '#131A2A',
  surfaceAlt: '#1A2236',
  border: '#232C42',
  borderStrong: '#34405C',
  text: '#E8ECF5',
  textMuted: '#A7B0C4',
  textSubtle: '#8791A7',
  primary: '#818CF8',
  primaryPressed: '#6366F1',
  primaryText: '#0B0F19',
  primarySoft: '#1E2246',
  danger: '#F87171',
  dangerSoft: '#3A1A1E',
  success: '#4ADE80',
  successSoft: '#13301F',
  warning: '#FBBF24',
  warningSoft: '#33270E',
  info: '#38BDF8',
  infoSoft: '#0E2A3A',
  ai: '#C4B5FD',
  aiSoft: '#251B42',
  inputBackground: '#0F1522',
  skeleton: '#1E273B',
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 } as const;

export const typography = {
  title: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18 },
  overline: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const },
};

export interface Tone {
  fg: string;
  bg: string;
}

export function statusTone(status: TicketStatus, colors: ThemeColors): Tone {
  switch (status) {
    case 'open':
      return { fg: colors.info, bg: colors.infoSoft };
    case 'pending':
      return { fg: colors.warning, bg: colors.warningSoft };
    case 'resolved':
      return { fg: colors.success, bg: colors.successSoft };
  }
}

export function priorityTone(priority: TicketPriority, colors: ThemeColors): Tone {
  switch (priority) {
    case 'low':
      return { fg: colors.textSubtle, bg: colors.surfaceAlt };
    case 'medium':
      return { fg: colors.info, bg: colors.infoSoft };
    case 'high':
      return { fg: colors.warning, bg: colors.warningSoft };
    case 'urgent':
      return { fg: colors.danger, bg: colors.dangerSoft };
  }
}

export const STATUS_LABELS: Record<TicketStatus, string> = { open: 'Open', pending: 'Pending', resolved: 'Resolved' };
export const PRIORITY_LABELS: Record<TicketPriority, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
