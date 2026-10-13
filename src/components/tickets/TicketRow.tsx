import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Ticket } from '@/api/schemas';
import { Avatar } from '@/components/ui/Avatar';
import { PriorityBadge, StatusBadge } from '@/components/ui/Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { STATUS_LABELS } from '@/theme/tokens';
import { relativeTime } from '@/utils/time';

export interface TicketRowProps {
  ticket: Ticket;
  pendingSync: boolean;
  onPress: (ticket: Ticket) => void;
}

export const TicketRow = memo(function TicketRow({ ticket, pendingSync, onPress }: TicketRowProps) {
  const { colors, typography } = useTheme();
  return (
    <Pressable
      testID={`ticket-row-${ticket.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Ticket ${ticket.number}: ${ticket.subject}. ${STATUS_LABELS[ticket.status]}, ${ticket.priority} priority`}
      onPress={() => onPress(ticket)}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.topLine}>
        <Text style={[typography.caption, { color: colors.textSubtle }]}>
          #{ticket.number} · {ticket.requester.name}
        </Text>
        <View style={styles.meta}>
          {pendingSync ? <Ionicons name="cloud-upload-outline" size={14} color={colors.warning} accessibilityLabel="Waiting to sync" /> : null}
          <Text style={[typography.caption, { color: colors.textSubtle }]}>{relativeTime(ticket.updatedAt)}</Text>
        </View>
      </View>
      <Text style={[typography.bodyStrong, { color: colors.text }]} numberOfLines={2}>
        {ticket.subject}
      </Text>
      <View style={styles.bottomLine}>
        <View style={styles.badges}>
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
        </View>
        <View style={styles.meta}>
          {ticket.commentCount > 0 ? (
            <View style={styles.meta}>
              <Ionicons name="chatbubble-outline" size={13} color={colors.textSubtle} />
              <Text style={[typography.caption, { color: colors.textSubtle }]}>{ticket.commentCount}</Text>
            </View>
          ) : null}
          {ticket.assignee ? (
            <Avatar name={ticket.assignee.name} size={24} />
          ) : (
            <Text style={[typography.caption, { color: colors.textSubtle }]}>Unassigned</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 14, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  topLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottomLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  badges: { flexDirection: 'row', gap: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
