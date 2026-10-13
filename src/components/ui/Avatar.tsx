import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

export function Avatar({ name, size = 36, tone = 'primary' }: { name: string; size?: number; tone?: 'primary' | 'neutral' }) {
  const { colors } = useTheme();
  const bg = tone === 'primary' ? colors.primarySoft : colors.surfaceAlt;
  const fg = tone === 'primary' ? colors.primary : colors.textMuted;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}
    >
      <Text style={[styles.text, { color: fg, fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '700' },
});
