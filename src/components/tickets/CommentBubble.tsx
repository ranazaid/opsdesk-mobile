import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { isPendingComment, type DisplayComment } from '@/offline/pending';
import { useTheme } from '@/theme/ThemeProvider';
import { formatTimestamp } from '@/utils/time';

export function CommentBubble({ comment }: { comment: DisplayComment }) {
  const { colors, typography, radius } = useTheme();
  const pending = isPendingComment(comment);
  const fromAgent = comment.authorId !== null;
  const internal = comment.isInternal;

  return (
    <View style={styles.row} testID={pending ? 'pending-comment' : `comment-${comment.id}`}>
      <Avatar name={comment.authorName} size={32} tone={fromAgent ? 'primary' : 'neutral'} />
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[typography.caption, styles.author, { color: colors.text }]}>{comment.authorName}</Text>
          <Text style={[typography.caption, { color: colors.textSubtle }]}>{internal ? 'Internal note' : fromAgent ? 'Team' : 'Customer'}</Text>
        </View>
        <View
          style={[
            styles.bubble,
            {
              borderRadius: radius.md,
              backgroundColor: internal ? colors.warningSoft : fromAgent ? colors.primarySoft : colors.surface,
              borderColor: pending ? colors.warning : internal ? colors.warningSoft : fromAgent ? colors.primarySoft : colors.border,
              borderStyle: pending ? 'dashed' : 'solid',
            },
          ]}
        >
          <Text style={[typography.body, { color: colors.text }]}>{comment.body}</Text>
        </View>
        <View style={styles.footer}>
          {pending ? (
            <>
              <Ionicons name="time-outline" size={12} color={colors.warning} />
              <Text style={[typography.caption, { color: colors.warning }]}>Waiting to sync</Text>
            </>
          ) : (
            <Text style={[typography.caption, { color: colors.textSubtle }]}>{formatTimestamp(comment.createdAt)}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  content: { flex: 1, gap: 4 },
  header: { flexDirection: 'row', gap: 8, alignItems: 'baseline' },
  author: { fontWeight: '600' },
  bubble: { paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
