import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '@/api/errors';
import { Button } from '@/components/ui/Button';
import { useAiSummary } from '@/features/tickets/hooks';
import { useTheme } from '@/theme/ThemeProvider';

export interface AiSummaryCardProps {
  ticketId: string;
  isOnline: boolean;
  /** Present only when the user can reply; enables "Use as reply". */
  onUseReply?: (text: string) => void;
}

export function AiSummaryCard({ ticketId, isOnline, onUseReply }: AiSummaryCardProps) {
  const { colors, radius, typography } = useTheme();
  const summary = useAiSummary(ticketId);

  return (
    <View testID="ai-summary-card" style={[styles.card, { backgroundColor: colors.aiSoft, borderColor: colors.ai, borderRadius: radius.lg }]}>
      <View style={styles.header}>
        <View style={styles.title}>
          <Ionicons name="sparkles" size={16} color={colors.ai} />
          <Text style={[typography.bodyStrong, { color: colors.text }]}>AI summary</Text>
        </View>
        {summary.data ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Regenerate summary" hitSlop={8} onPress={() => summary.mutate()} disabled={summary.isPending}>
            <Ionicons name="refresh" size={18} color={colors.ai} />
          </Pressable>
        ) : null}
      </View>

      {summary.isPending ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.ai} />
          <Text style={[typography.caption, { color: colors.textMuted }]}>Reading the conversation…</Text>
        </View>
      ) : summary.data ? (
        <View style={styles.body}>
          <Text style={[typography.body, { color: colors.text }]}>{summary.data.summary}</Text>
          <Text style={[typography.overline, { color: colors.ai }]}>Suggested reply</Text>
          <Text style={[typography.body, styles.reply, { color: colors.textMuted, borderLeftColor: colors.ai }]}>{summary.data.suggestedReply}</Text>
          {onUseReply ? (
            <Button label="Use as reply" icon="return-down-forward" size="sm" variant="secondary" onPress={() => onUseReply(summary.data.suggestedReply)} />
          ) : null}
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={[typography.caption, { color: summary.isError ? colors.danger : colors.textMuted }]}>
            {summary.isError
              ? errorMessage(summary.error)
              : isOnline
                ? 'Get a two-line summary of this conversation and a suggested reply.'
                : 'AI summaries need a connection.'}
          </Text>
          <Button
            testID="ai-summary-button"
            label={summary.isError ? 'Try again' : 'Summarize'}
            icon="sparkles-outline"
            size="sm"
            variant="secondary"
            disabled={!isOnline}
            onPress={() => summary.mutate()}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, padding: 14, gap: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  body: { gap: 10, alignItems: 'flex-start' },
  reply: { borderLeftWidth: 2, paddingLeft: 10, fontStyle: 'italic' },
});
