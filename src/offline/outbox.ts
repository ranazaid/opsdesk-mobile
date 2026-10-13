import { z } from 'zod';

import { isApiError } from '@/api/errors';
import { ticketPrioritySchema, ticketStatusSchema, userSummarySchema } from '@/api/schemas';

/**
 * Durable, ordered queue of writes made while offline (or while the request
 * failed with a retryable error).
 *
 * Design:
 * - Strict FIFO replay. The head entry must succeed (or be dropped as a
 *   permanent failure) before anything behind it is sent, so the server sees
 *   writes in the order the user made them.
 * - Retryable failures (network, timeout, 408/429/5xx) keep the entry, bump
 *   `attempts` and schedule `nextAttemptAt` with capped exponential backoff.
 *   After `maxAttempts` the entry is dropped and reported.
 * - Non-retryable failures (400/403/404/409/validation) drop the entry
 *   immediately and report it so the UI can tell the user; retrying would never
 *   succeed and would block every write behind it.
 * - Every mutation is persisted before it is acknowledged. Writes to storage
 *   are serialised so a slow write can never overwrite a newer one.
 * - Repeated ticket updates are coalesced into the pending entry for that
 *   ticket (last write wins per field), unless that entry is in flight.
 * - Comments carry a client-generated id used as an idempotency key, so a
 *   replay after a lost response cannot duplicate the comment.
 */

export const OUTBOX_STORAGE_KEY = 'opsdesk.outbox.v1';

const ticketPatchSchema = z.object({
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  assigneeId: z.string().nullable().optional(),
});

const operationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('comment.create'),
    ticketId: z.string(),
    clientId: z.string(),
    body: z.string(),
    author: userSummarySchema,
  }),
  z.object({
    type: z.literal('ticket.update'),
    ticketId: z.string(),
    patch: ticketPatchSchema,
    /** Display-only: lets the optimistic overlay show the new assignee's name. */
    assignee: userSummarySchema.nullable().optional(),
  }),
]);

const entrySchema = z.object({
  id: z.string(),
  op: operationSchema,
  createdAt: z.string(),
  attempts: z.number().int().nonnegative(),
  nextAttemptAt: z.number().nullable(),
  lastError: z.string().optional(),
});

const persistedSchema = z.object({ version: z.literal(1), entries: z.array(entrySchema) });

export type OutboxOperation = z.infer<typeof operationSchema>;
export type OutboxEntry = z.infer<typeof entrySchema>;

export interface OutboxStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface OutboxOptions {
  storage: OutboxStorage;
  storageKey?: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  now?: () => number;
  createId?: () => string;
}

export interface DroppedEntry {
  entry: OutboxEntry;
  error: unknown;
  reason: 'rejected' | 'max_attempts';
}

export interface ReplayResult {
  succeeded: OutboxEntry[];
  dropped: DroppedEntry[];
  /** Entry that stopped the run after a retryable failure (or still in backoff). */
  blockedBy: OutboxEntry | null;
  remaining: number;
}

export interface ReplayOptions {
  /** Ignore backoff timers, e.g. right after connectivity is restored. */
  ignoreBackoff?: boolean;
}

export type OutboxExecutor = (entry: OutboxEntry) => Promise<void>;
type Listener = (entries: readonly OutboxEntry[]) => void;

let fallbackCounter = 0;
export function createLocalId(prefix = 'local'): string {
  fallbackCounter += 1;
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}${fallbackCounter.toString(36)}`;
}

export function isRetryableError(error: unknown): boolean {
  return isApiError(error) && error.retryable;
}

export class Outbox {
  private entries: OutboxEntry[] = [];
  private readonly listeners = new Set<Listener>();
  private hydration: Promise<void> | null = null;
  private replaying: Promise<ReplayResult> | null = null;
  private inFlightId: string | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  private readonly storage: OutboxStorage;
  private readonly storageKey: string;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly now: () => number;
  private readonly createId: () => string;

  constructor(options: OutboxOptions) {
    this.storage = options.storage;
    this.storageKey = options.storageKey ?? OUTBOX_STORAGE_KEY;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.baseDelayMs = options.baseDelayMs ?? 2_000;
    this.maxDelayMs = options.maxDelayMs ?? 60_000;
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? (() => createLocalId('op'));
  }

  /** Load persisted entries once. Corrupt or incompatible data is discarded rather than crashing the app. */
  hydrate(): Promise<void> {
    this.hydration ??= (async () => {
      const raw = await this.storage.getItem(this.storageKey);
      if (!raw) return;
      try {
        const parsed = persistedSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          // Entries enqueued before hydration finished stay behind the persisted ones.
          this.entries = [...parsed.data.entries, ...this.entries];
          this.emit();
          return;
        }
      } catch {
        // fall through
      }
      console.warn('[outbox] discarding unreadable persisted queue');
      await this.storage.removeItem(this.storageKey);
    })();
    return this.hydration;
  }

  getEntries(): readonly OutboxEntry[] {
    return this.entries;
  }

  get size(): number {
    return this.entries.length;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async enqueue(op: OutboxOperation): Promise<OutboxEntry> {
    await this.hydrate();

    if (op.type === 'ticket.update') {
      const existing = this.entries.find(
        (entry) => entry.op.type === 'ticket.update' && entry.op.ticketId === op.ticketId && entry.id !== this.inFlightId,
      );
      if (existing && existing.op.type === 'ticket.update') {
        const merged: OutboxEntry = {
          ...existing,
          op: {
            ...existing.op,
            patch: { ...existing.op.patch, ...op.patch },
            assignee: op.patch.assigneeId !== undefined ? op.assignee : existing.op.assignee,
          },
        };
        this.entries = this.entries.map((entry) => (entry.id === existing.id ? merged : entry));
        await this.commit();
        return merged;
      }
    }

    const entry: OutboxEntry = {
      id: this.createId(),
      op,
      createdAt: new Date(this.now()).toISOString(),
      attempts: 0,
      nextAttemptAt: null,
    };
    this.entries = [...this.entries, entry];
    await this.commit();
    return entry;
  }

  async remove(id: string): Promise<void> {
    this.entries = this.entries.filter((entry) => entry.id !== id);
    await this.commit();
  }

  async clear(): Promise<void> {
    await this.hydrate();
    this.entries = [];
    await this.commit();
  }

  /** Delay before the next attempt after `attempts` failures: base * 2^(attempts-1), capped. */
  backoffDelay(attempts: number): number {
    return Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** Math.max(0, attempts - 1));
  }

  /**
   * Send queued entries in order. Concurrent calls share the same run, so a
   * NetInfo event and a pull-to-refresh can never send the same entry twice.
   */
  replay(executor: OutboxExecutor, options: ReplayOptions = {}): Promise<ReplayResult> {
    if (!this.replaying) {
      this.replaying = this.runReplay(executor, options).finally(() => {
        this.replaying = null;
      });
    }
    return this.replaying;
  }

  private async runReplay(executor: OutboxExecutor, { ignoreBackoff = false }: ReplayOptions): Promise<ReplayResult> {
    await this.hydrate();
    const result: ReplayResult = { succeeded: [], dropped: [], blockedBy: null, remaining: 0 };

    for (;;) {
      const head = this.entries[0];
      if (!head) break;
      if (!ignoreBackoff && head.nextAttemptAt !== null && head.nextAttemptAt > this.now()) {
        result.blockedBy = head;
        break;
      }

      this.inFlightId = head.id;
      try {
        await executor(head);
        this.inFlightId = null;
        // Updates are never coalesced into the in-flight entry, so removing it cannot lose a newer patch.
        await this.remove(head.id);
        result.succeeded.push(head);
      } catch (error) {
        this.inFlightId = null;
        const attempts = head.attempts + 1;
        const lastError = error instanceof Error ? error.message : String(error);

        if (isRetryableError(error) && attempts < this.maxAttempts) {
          const updated: OutboxEntry = { ...head, attempts, lastError, nextAttemptAt: this.now() + this.backoffDelay(attempts) };
          this.entries = this.entries.map((entry) => (entry.id === head.id ? updated : entry));
          await this.commit();
          result.blockedBy = updated;
          break;
        }

        await this.remove(head.id);
        result.dropped.push({
          entry: { ...head, attempts, lastError },
          error,
          reason: isRetryableError(error) ? 'max_attempts' : 'rejected',
        });
      }
    }

    result.remaining = this.entries.length;
    return result;
  }

  private commit(): Promise<void> {
    this.emit();
    const snapshot = JSON.stringify({ version: 1, entries: this.entries });
    const write = this.writeChain.then(() => this.storage.setItem(this.storageKey, snapshot));
    // Keep the chain alive even if one write fails; surface the failure to this caller only.
    this.writeChain = write.catch((error: unknown) => {
      console.warn('[outbox] failed to persist queue', error);
    });
    return write;
  }

  private emit(): void {
    const snapshot = this.entries;
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
