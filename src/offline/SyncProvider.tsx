import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { errorMessage } from '@/api/errors';
import { useApi } from '@/api/ApiProvider';
import { writeCommentToCache, writeTicketToCache } from '@/features/tickets/cache';
import { ticketKeys } from '@/features/tickets/queryKeys';
import { trackAction, trackError } from '@/monitoring/monitoring';

import type { Outbox, OutboxEntry, OutboxExecutor, OutboxOperation, ReplayResult } from './outbox';
import { useNetworkStatus } from './useNetworkStatus';

export interface DroppedNotice {
  count: number;
  message: string;
}

export interface SyncContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  entries: readonly OutboxEntry[];
  droppedNotice: DroppedNotice | null;
  dismissDroppedNotice(): void;
  /** Outbox-first write: persist, render optimistically, send now if online. */
  submit(op: OutboxOperation): Promise<OutboxEntry>;
  syncNow(options?: { ignoreBackoff?: boolean }): Promise<ReplayResult | null>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export interface SyncProviderProps {
  outbox: Outbox;
  /** Only replay while signed in. */
  enabled: boolean;
  children: ReactNode;
}

export function SyncProvider({ outbox, enabled, children }: SyncProviderProps) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { isOnline } = useNetworkStatus();
  const [entries, setEntries] = useState<readonly OutboxEntry[]>(outbox.getEntries());
  const [isSyncing, setIsSyncing] = useState(false);
  const [droppedNotice, setDroppedNotice] = useState<DroppedNotice | null>(null);
  const [backoffTick, setBackoffTick] = useState(0);
  const canSync = enabled && isOnline;
  const canSyncRef = useRef(canSync);
  useEffect(() => {
    canSyncRef.current = canSync;
  }, [canSync]);

  useEffect(() => {
    const unsubscribe = outbox.subscribe(setEntries);
    outbox
      .hydrate()
      .then(() => setEntries(outbox.getEntries()))
      .catch((error: unknown) => trackError(error, { area: 'outbox.hydrate' }));
    return unsubscribe;
  }, [outbox]);

  const executor = useCallback<OutboxExecutor>(
    async ({ op }) => {
      if (op.type === 'comment.create') {
        writeCommentToCache(queryClient, await api.addComment(op.ticketId, op.body, op.clientId));
      } else {
        writeTicketToCache(queryClient, await api.updateTicket(op.ticketId, op.patch));
      }
    },
    [api, queryClient],
  );

  const syncNow = useCallback(
    async (options?: { ignoreBackoff?: boolean }) => {
      if (!canSyncRef.current || outbox.size === 0) return null;
      setIsSyncing(true);
      try {
        const result = await outbox.replay(executor, options);
        if (result.succeeded.length > 0) {
          trackAction('outbox.replayed', { count: result.succeeded.length });
          void queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
        }
        if (result.dropped.length > 0) {
          const first = result.dropped[0]!;
          trackError(first.error, { area: 'outbox.dropped', reason: first.reason, op: first.entry.op.type });
          setDroppedNotice({ count: result.dropped.length, message: errorMessage(first.error) });
          result.dropped.forEach(({ entry }) => void queryClient.invalidateQueries({ queryKey: ticketKeys.detail(entry.op.ticketId) }));
        }
        if (result.blockedBy) setBackoffTick((tick) => tick + 1);
        return result;
      } finally {
        setIsSyncing(false);
      }
    },
    [executor, outbox, queryClient],
  );

  // Connectivity restored (or signed in): flush immediately, ignoring backoff timers.
  useEffect(() => {
    if (canSync) void syncNow({ ignoreBackoff: true });
  }, [canSync, syncNow]);

  // Returning to the foreground is another good moment to flush.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void syncNow();
    });
    return () => subscription.remove();
  }, [syncNow]);

  // While the head entry is backing off, schedule the next attempt.
  useEffect(() => {
    const head = entries[0];
    if (!canSync || !head?.nextAttemptAt) return;
    const timer = setTimeout(() => void syncNow(), Math.max(0, head.nextAttemptAt - Date.now()));
    return () => clearTimeout(timer);
  }, [canSync, entries, backoffTick, syncNow]);

  const submit = useCallback(
    async (op: OutboxOperation) => {
      const entry = await outbox.enqueue(op);
      if (canSyncRef.current) void syncNow();
      return entry;
    },
    [outbox, syncNow],
  );

  const value = useMemo<SyncContextValue>(
    () => ({
      isOnline,
      isSyncing,
      entries,
      droppedNotice,
      dismissDroppedNotice: () => setDroppedNotice(null),
      submit,
      syncNow,
    }),
    [isOnline, isSyncing, entries, droppedNotice, submit, syncNow],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error('useSync must be used inside <SyncProvider>');
  return value;
}
