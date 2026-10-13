import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Button } from './Button';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name={icon} size={28} color={colors.textSubtle} />
      </View>
      <Text style={[typography.heading, { color: colors.text, textAlign: 'center' }]}>{title}</Text>
      {message ? <Text style={[typography.body, { color: colors.textMuted, textAlign: 'center' }]}>{message}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} variant="secondary" size="sm" onPress={onAction} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState icon="cloud-offline-outline" title="Couldn't load this" message={message} actionLabel={onRetry ? 'Try again' : undefined} onAction={onRetry} />
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.primary} />
      <Text style={[typography.caption, { color: colors.textSubtle }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  iconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
