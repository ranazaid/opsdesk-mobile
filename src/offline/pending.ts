import type { Comment, Ticket } from '@/api/schemas';

import type { OutboxEntry } from './outbox';

/**
 * Optimistic overlay: the UI renders `server state + queued writes`.
 *
 * Instead of mutating the TanStack Query cache and hoping no refetch clobbers
 * it, screens derive what to show from the cached server data and the outbox.
 * A pull-to-refresh while offline, or an app restart with queued writes, still
 * shows the user's pending changes; when the outbox drains they disappear and
 * the server's version (written into the cache by the replay executor) takes over.
 */

export interface PendingComment extends Comment {
  pending: true;
  /** Outbox entry id, for "retry" / "discard" affordances. */
  entryId: string;
}

export type DisplayComment = Comment | PendingComment;

export function isPendingComment(comment: DisplayComment): comment is PendingComment {
  return (comment as PendingComment).pending === true;
}

export function applyPendingToTicket<T extends Ticket>(ticket: T, entries: readonly OutboxEntry[]): T {
  let result = ticket;
  for (const entry of entries) {
    const { op } = entry;
    if (op.ticketId !== ticket.id) continue;
    if (op.type === 'ticket.update') {
      const { status, priority, assigneeId } = op.patch;
      result = {
        ...result,
        ...(status ? { status } : null),
        ...(priority ? { priority } : null),
        ...(assigneeId !== undefined ? { assignee: assigneeId === null ? null : (op.assignee ?? result.assignee) } : null),
      };
    } else {
      result = { ...result, commentCount: result.commentCount + 1 };
    }
  }
  return result;
}

export function pendingCommentsFor(ticketId: string, entries: readonly OutboxEntry[]): PendingComment[] {
  return entries.flatMap((entry) =>
    entry.op.type === 'comment.create' && entry.op.ticketId === ticketId
      ? [
          {
            id: entry.op.clientId,
            ticketId,
            body: entry.op.body,
            author: { id: entry.op.author.id, name: entry.op.author.name, kind: 'agent' as const },
            createdAt: entry.createdAt,
            pending: true as const,
            entryId: entry.id,
          },
        ]
      : [],
  );
}

export function hasPendingChanges(ticketId: string, entries: readonly OutboxEntry[]): boolean {
  return entries.some((entry) => entry.op.ticketId === ticketId);
}
