import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useImperativeHandle, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export interface ReplyComposerHandle {
  setDraft(text: string): void;
}

export interface ReplyComposerProps {
  onSend: (body: string) => Promise<unknown> | void;
  isOnline: boolean;
  bottomInset: number;
}

const MAX_LENGTH = 5000;

export const ReplyComposer = forwardRef<ReplyComposerHandle, ReplyComposerProps>(function ReplyComposer({ onSend, isOnline, bottomInset }, ref) {
  const { colors, radius, typography } = useTheme();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const canSend = draft.trim().length > 0 && !sending;

  useImperativeHandle(ref, () => ({ setDraft }), []);

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await onSend(draft);
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(bottomInset, 10) }]}>
      {!isOnline ? (
        <Text style={[typography.caption, styles.hint, { color: colors.warning }]}>Offline: your reply will be sent when you reconnect.</Text>
      ) : null}
      <View style={styles.inputRow}>
        <TextInput
          testID="reply-input"
          accessibilityLabel="Reply"
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a reply…"
          placeholderTextColor={colors.textSubtle}
          multiline
          maxLength={MAX_LENGTH}
          style={[styles.input, { color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.border, borderRadius: radius.lg }]}
        />
        <Pressable
          testID="reply-send"
          accessibilityRole="button"
          accessibilityLabel="Send reply"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={send}
          style={({ pressed }) => [
            styles.send,
            { backgroundColor: canSend ? (pressed ? colors.primaryPressed : colors.primary) : colors.surfaceAlt },
          ]}
        >
          <Ionicons name="arrow-up" size={20} color={canSend ? colors.primaryText : colors.textSubtle} />
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 10, gap: 6 },
  hint: { paddingHorizontal: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 42, maxHeight: 140, borderWidth: 1, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, fontSize: 15 },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
