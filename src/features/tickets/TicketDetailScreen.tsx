import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '@/api/errors';
import { TICKET_PRIORITIES, TICKET_STATUSES, type Member, type TicketDetail } from '@/api/schemas';
import { useAuth } from '@/auth/AuthProvider';
import { AiSummaryCard } from '@/components/tickets/AiSummaryCard';
import { AssigneePicker } from '@/components/tickets/AssigneePicker';
import { CommentBubble } from '@/components/tickets/CommentBubble';
import { ReplyComposer, type ReplyComposerHandle } from '@/components/tickets/ReplyComposer';
import { SyncBanner } from '@/components/tickets/SyncBanner';
import { Avatar } from '@/components/ui/Avatar';
import { PriorityBadge, StatusBadge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/StateViews';
import type { DisplayComment } from '@/offline/pending';
import { useSync } from '@/offline/SyncProvider';
import { can, canEdit } from '@/permissions/matrix';
import { useTheme } from '@/theme/ThemeProvider';
import { PRIORITY_LABELS, STATUS_LABELS } from '@/theme/tokens';
import { formatTimestamp } from '@/utils/time';

import { useMembers, useTicket, useTicketActions } from './hooks';

const STATUS_SEGMENTS = TICKET_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] }));

export function TicketDetailScreen({ ticketId }: { ticketId: string }) {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isOnline, syncNow } = useSync();
  const { ticket, comments, hasPending, isPending, isError, error, refetch, fetchStatus } = useTicket(ticketId);
  const actions = useTicketActions(ticketId, user);
  const role = user?.role;
  const members = useMembers(role);
  const composerRef = useRef<ReplyComposerHandle>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([syncNow({ ignoreBackoff: true }), refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, syncNow]);

  const onAssign = useCallback(
    (member: Member | null) => {
      setPickerOpen(false);
      void actions.reassign(member);
    },
    [actions],
  );

  // Never opened before and no connection: TanStack pauses the query instead of failing it.
  if (isPending && fetchStatus === 'paused') {
    return <EmptyState icon="cloud-offline-outline" title="Not available offline" message="This ticket hasn't been opened on this device yet. It will load as soon as you're back online." />;
  }
  if (isPending) return <LoadingState label="Loading ticket…" />;
  if (!ticket) return <ErrorState message={isError ? errorMessage(error) : 'Ticket not found.'} onRetry={() => void refetch()} />;

  const canReply = can(role, 'comment:create');

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <Stack.Screen options={{ title: `#${ticket.number}` }} />
      <SyncBanner />
      <FlatList
        testID="ticket-detail"
        data={comments}
        keyExtractor={(comment) => comment.id}
        renderItem={({ item }: { item: DisplayComment }) => <CommentBubble comment={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <TicketSummary ticket={ticket} hasPending={hasPending} />

            {canEdit(role) ? (
              <Card style={styles.section}>
                <Text style={[typography.overline, { color: colors.textSubtle }]}>Status</Text>
                <SegmentedControl
                  testID="status-control"
                  accessibilityLabel="Ticket status"
                  segments={STATUS_SEGMENTS}
                  value={ticket.status}
                  disabled={!can(role, 'ticket:update')}
                  onChange={(status) => void actions.setStatus(status)}
                />
                <Text style={[typography.overline, styles.label, { color: colors.textSubtle }]}>Priority</Text>
                <View style={styles.chips}>
                  {TICKET_PRIORITIES.map((priority) => (
                    <Chip
                      key={priority}
                      label={PRIORITY_LABELS[priority]}
                      selected={ticket.priority === priority}
                      onPress={can(role, 'ticket:update') ? () => void actions.setPriority(priority) : undefined}
                    />
                  ))}
                </View>
                <Text style={[typography.overline, styles.label, { color: colors.textSubtle }]}>Assignee</Text>
                <View style={styles.assigneeRow}>
                  <View style={styles.inline}>
                    {ticket.assigneeName ? <Avatar name={ticket.assigneeName} size={28} /> : null}
                    <Text style={[typography.body, { color: ticket.assigneeName ? colors.text : colors.textSubtle }]}>{ticket.assigneeName ?? 'Unassigned'}</Text>
                  </View>
                  {can(role, 'ticket:assign') ? (
                    <Pressable testID="reassign-button" accessibilityRole="button" accessibilityLabel="Change assignee" hitSlop={8} onPress={() => setPickerOpen(true)}>
                      <Text style={[typography.bodyStrong, { color: colors.primary }]}>Change</Text>
                    </Pressable>
                  ) : (
                    <Text style={[typography.caption, { color: colors.textSubtle }]}>Your role can&apos;t reassign</Text>
                  )}
                </View>
              </Card>
            ) : (
              <View testID="read-only-notice" style={[styles.readOnly, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
                <Text style={[typography.caption, { color: colors.textMuted, flex: 1 }]}>You have view-only access. Ask an admin for agent access to reply or update tickets.</Text>
              </View>
            )}

            {can(role, 'ai:use') ? (
              <AiSummaryCard ticketId={ticket.id} isOnline={isOnline} onUseReply={canReply ? (text) => composerRef.current?.setDraft(text) : undefined} />
            ) : null}

            <Text style={[typography.overline, styles.conversation, { color: colors.textSubtle }]}>Conversation · {comments.length}</Text>
          </View>
        }
        ListEmptyComponent={<Text style={[typography.caption, styles.noComments, { color: colors.textSubtle }]}>No replies yet.</Text>}
        contentContainerStyle={styles.listContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      />
      {canReply ? <ReplyComposer ref={composerRef} onSend={actions.reply} isOnline={isOnline} bottomInset={insets.bottom} /> : null}
      <AssigneePicker
        visible={pickerOpen}
        members={members.data}
        loading={members.isPending}
        currentId={ticket.assigneeId}
        onSelect={onAssign}
        onClose={() => setPickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

function TicketSummary({ ticket, hasPending }: { ticket: TicketDetail; hasPending: boolean }) {
  const { colors, typography } = useTheme();
  return (
    <Card style={styles.section}>
      <View style={styles.inline}>
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
        {hasPending ? (
          <View style={styles.inline}>
            <Ionicons name="cloud-upload-outline" size={14} color={colors.warning} />
            <Text style={[typography.caption, { color: colors.warning }]}>Pending sync</Text>
          </View>
        ) : null}
      </View>
      <Text style={[typography.title, { color: colors.text, fontSize: 20 }]}>{ticket.subject}</Text>
      <Text style={[typography.caption, { color: colors.textSubtle }]}>
        {ticket.requesterName} · {ticket.requesterEmail} · opened {formatTimestamp(ticket.createdAt)}
      </Text>
      <Text style={[typography.body, { color: colors.textMuted }]}>{ticket.description}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { padding: 16, gap: 12 },
  section: { gap: 10 },
  label: { marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  assigneeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readOnly: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10 },
  conversation: { marginTop: 8 },
  noComments: { paddingHorizontal: 16 },
  listContent: { paddingBottom: 16 },
});
