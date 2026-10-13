import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  accessibilityLabel: string;
  testID?: string;
}

export function SegmentedControl<T extends string>({ segments, value, onChange, disabled, accessibilityLabel, testID }: SegmentedControlProps<T>) {
  const { colors, radius } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, opacity: disabled ? 0.55 : 1 }]}
    >
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            testID={testID ? `${testID}-${segment.value}` : undefined}
            accessibilityRole="radio"
            accessibilityLabel={segment.label}
            accessibilityState={{ selected, disabled: !!disabled }}
            disabled={disabled}
            onPress={() => !selected && onChange(segment.value)}
            style={[
              styles.segment,
              { borderRadius: radius.sm },
              selected && { backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
            ]}
          >
            <Text style={[styles.label, { color: selected ? colors.text : colors.textMuted }]} numberOfLines={1}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  label: { fontSize: 13, fontWeight: '600' },
});
