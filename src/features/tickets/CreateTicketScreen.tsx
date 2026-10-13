import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '@/api/errors';
import { createTicketInputSchema, TICKET_PRIORITIES, type CreateTicketInput, type TicketPriority } from '@/api/schemas';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { EmptyState } from '@/components/ui/StateViews';
import { TextField } from '@/components/ui/TextField';
import { useSync } from '@/offline/SyncProvider';
import { can } from '@/permissions/matrix';
import { useTheme } from '@/theme/ThemeProvider';
import { PRIORITY_LABELS } from '@/theme/tokens';

import { useCreateTicket } from './hooks';

type FieldErrors = Partial<Record<keyof CreateTicketInput, string>>;

const PRIORITY_SEGMENTS = TICKET_PRIORITIES.map((priority) => ({ value: priority, label: PRIORITY_LABELS[priority] }));

export function CreateTicketScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const { user } = useAuth();
  const { isOnline } = useSync();
  const createTicket = useCreateTicket();
  const [subject, setSubject] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [errors, setErrors] = useState<FieldErrors>({});

  if (!can(user?.role, 'ticket:create')) {
    return <EmptyState icon="lock-closed-outline" title="View-only access" message="Your role can't create tickets." actionLabel="Go back" onAction={() => router.back()} />;
  }

  const submit = () => {
    const parsed = createTicketInputSchema.safeParse({ subject, requesterName, requesterEmail, description, priority });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof CreateTicketInput | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    createTicket.mutate(parsed.data, {
      onSuccess: (ticket) => router.replace(`/tickets/${ticket.id}`),
    });
  };

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          testID="new-subject"
          label="Subject"
          value={subject}
          onChangeText={setSubject}
          placeholder="Short summary of the issue"
          error={errors.subject}
          maxLength={140}
          returnKeyType="next"
        />
        <TextField
          testID="new-requester-name"
          label="Customer name"
          value={requesterName}
          onChangeText={setRequesterName}
          placeholder="Jane Cooper"
          error={errors.requesterName}
          autoComplete="name"
          returnKeyType="next"
        />
        <TextField
          testID="new-requester"
          label="Customer email"
          value={requesterEmail}
          onChangeText={setRequesterEmail}
          placeholder="customer@company.com"
          error={errors.requesterEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
        />
        <View style={styles.field}>
          <Text style={[typography.caption, styles.fieldLabel, { color: colors.textMuted }]}>Priority</Text>
          <SegmentedControl accessibilityLabel="Priority" segments={PRIORITY_SEGMENTS} value={priority} onChange={setPriority} />
        </View>
        <TextField
          testID="new-description"
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="What happened? Include steps, order numbers or error messages."
          error={errors.description}
          multiline
          maxLength={5000}
        />
        {createTicket.isError ? (
          <Text accessibilityRole="alert" style={[typography.caption, { color: colors.danger }]}>
            {errorMessage(createTicket.error)}
          </Text>
        ) : null}
        {!isOnline ? (
          <Text style={[typography.caption, { color: colors.warning }]}>You&apos;re offline. New tickets need a connection so they get a ticket number.</Text>
        ) : null}
        <Button testID="new-submit" label="Create ticket" icon="add-circle-outline" onPress={submit} loading={createTicket.isPending} disabled={!isOnline} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 16 },
  field: { gap: 6 },
  fieldLabel: { fontWeight: '600' },
});
