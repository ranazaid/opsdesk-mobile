import { StyleSheet, Text, View } from 'react-native';

import type { TicketPriority, TicketStatus } from '@/api/schemas';
import { useTheme } from '@/theme/ThemeProvider';
import { PRIORITY_LABELS, priorityTone, STATUS_LABELS, statusTone, type Tone } from '@/theme/tokens';

export function Badge({ label, tone, dot = false }: { label: string; tone: Tone; dot?: boolean }) {
  const { radius } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg, borderRadius: radius.pill }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: tone.fg }]} /> : null}
      <Text style={[styles.label, { color: tone.fg }]}>{label}</Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  const { colors } = useTheme();
  return <Badge label={STATUS_LABELS[status]} tone={statusTone(status, colors)} dot />;
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const { colors } = useTheme();
  return <Badge label={PRIORITY_LABELS[priority]} tone={priorityTone(priority, colors)} />;
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 12, fontWeight: '600' },
});
