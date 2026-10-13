import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'md' | 'sm';
  icon?: ComponentProps<typeof Ionicons>['name'];
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

export function Button({ label, onPress, variant = 'primary', size = 'md', icon, loading, disabled, style, accessibilityHint, testID }: ButtonProps) {
  const { colors, radius } = useTheme();
  const isDisabled = disabled || loading;

  const palette: Record<Variant, { bg: string; pressed: string; fg: string; border: string }> = {
    primary: { bg: colors.primary, pressed: colors.primaryPressed, fg: colors.primaryText, border: colors.primary },
    secondary: { bg: colors.surface, pressed: colors.surfaceAlt, fg: colors.text, border: colors.borderStrong },
    ghost: { bg: 'transparent', pressed: colors.surfaceAlt, fg: colors.primary, border: 'transparent' },
    danger: { bg: colors.dangerSoft, pressed: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  };
  const tone = palette[variant];

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: pressed ? tone.pressed : tone.bg, borderColor: tone.border, borderRadius: radius.md },
        isDisabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={tone.fg} />
        ) : icon ? (
          <Ionicons name={icon} size={size === 'sm' ? 15 : 18} color={tone.fg} />
        ) : null}
        <Text style={[styles.label, size === 'sm' && styles.labelSm, { color: tone.fg }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  md: { minHeight: 48, paddingHorizontal: 18 },
  sm: { minHeight: 36, paddingHorizontal: 12 },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 15, fontWeight: '600' },
  labelSm: { fontSize: 13 },
  disabled: { opacity: 0.5 },
});
