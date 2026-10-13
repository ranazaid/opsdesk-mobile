import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useApi } from '@/api/ApiProvider';
import type { CreateTicketInput, Member, Ticket, TicketDetail, TicketPriority, TicketStatus, User } from '@/api/schemas';
import { createLocalId } from '@/offline/outbox';
import { applyPendingToTicket, pendingCommentsFor, type DisplayComment } from '@/offline/pending';
import { useSync } from '@/offline/SyncProvider';
import { can } from '@/permissions/matrix';

import { writeTicketToCache } from './cache';
import { memberKeys, ticketKeys, type TicketListFilters } from './queryKeys';

export function useTicketList(filters: TicketListFilters) {
  const api = useApi();
  const { entries } = useSync();
  const query = useInfiniteQuery({
    queryKey: ticketKeys.list(filters),
    queryFn: ({ pageParam, signal }) =>
      api.listTickets({ status: filters.status ?? undefined, q: filters.q || undefined, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.page * lastPage.pageSize < lastPage.total ? lastPage.page + 1 : undefined),
  });

  // Overlay queued writes, then re-apply the status filter so a ticket resolved
  // offline leaves the "Open" list immediately.
  const tickets = useMemo<Ticket[]>(() => {
    const seen = new Set<string>();
    const all = (query.data?.pages ?? []).flatMap((page) => page.items).filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
    const shown = all.map((ticket) => applyPendingToTicket(ticket, entries));
    return filters.status ? shown.filter((ticket) => ticket.status === filters.status) : shown;
  }, [query.data, entries, filters.status]);

  return { ...query, tickets };
}

export function useTicket(id: string) {
  const api = useApi();
  const { entries } = useSync();
  const query = useQuery({
    queryKey: ticketKeys.detail(id),
    queryFn: ({ signal }) => api.getTicket(id, signal),
  });

  const ticket = useMemo<TicketDetail | undefined>(() => (query.data ? applyPendingToTicket(query.data, entries) : undefined), [query.data, entries]);
  const comments = useMemo<DisplayComment[]>(
    () => [...(query.data?.comments ?? []), ...pendingCommentsFor(id, entries)],
    [query.data?.comments, id, entries],
  );
  const hasPending = useMemo(() => entries.some((entry) => entry.op.ticketId === id), [entries, id]);

  return { ...query, ticket, comments, hasPending };
}

/** Outbox-first ticket actions. They work identically online and offline. */
export function useTicketActions(ticketId: string, user: User | null) {
  const { submit } = useSync();

  const reply = useCallback(
    (body: string) => {
      if (!user) return Promise.reject(new Error('Not signed in'));
      return submit({
        type: 'comment.create',
        ticketId,
        body: body.trim(),
        clientId: createLocalId('cmt'),
        author: { id: user.id, name: user.name },
      });
    },
    [submit, ticketId, user],
  );

  const setStatus = useCallback((status: TicketStatus) => submit({ type: 'ticket.update', ticketId, patch: { status } }), [submit, ticketId]);

  const setPriority = useCallback(
    (priority: TicketPriority) => submit({ type: 'ticket.update', ticketId, patch: { priority } }),
    [submit, ticketId],
  );

  const reassign = useCallback(
    (assignee: Pick<Member, 'userId' | 'name'> | null) =>
      submit({
        type: 'ticket.update',
        ticketId,
        patch: { assigneeId: assignee?.userId ?? null },
        assignee: assignee ? { id: assignee.userId, name: assignee.name } : null,
      }),
    [submit, ticketId],
  );

  return { reply, setStatus, setPriority, reassign };
}

export function useCreateTicket() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTicketInput) => api.createTicket(input),
    onSuccess: (ticket) => {
      writeTicketToCache(queryClient, ticket);
      void queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
    },
  });
}

export function useAiSummary(ticketId: string) {
  const api = useApi();
  return useMutation({
    mutationKey: ['ai-summary', ticketId],
    mutationFn: () => api.summarizeTicket(ticketId),
  });
}

export function useMembers(role: User['role'] | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: memberKeys.all,
    queryFn: () => api.listMembers(),
    enabled: can(role, 'ticket:assign'),
    staleTime: 5 * 60_000,
  });
}
