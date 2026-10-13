import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError } from '@/api/errors';

import { Outbox, OUTBOX_STORAGE_KEY, type OutboxEntry, type OutboxOperation } from '../outbox';
import { applyPendingToTicket, pendingCommentsFor } from '../pending';

const author = { id: 'usr_agent', name: 'Ayesha Khan' };
const comment = (ticketId: string, body: string, clientId = `c-${body}`): OutboxOperation => ({
  type: 'comment.create',
  ticketId,
  body,
  clientId,
  author,
});
const statusChange = (ticketId: string, status: 'open' | 'pending' | 'resolved'): OutboxOperation => ({
  type: 'ticket.update',
  ticketId,
  patch: { status },
});

const networkError = () => new ApiError({ kind: 'network', message: 'Network request failed' });
const forbiddenError = () => new ApiError({ kind: 'http', status: 403, message: 'Forbidden' });

function makeOutbox(overrides: Partial<ConstructorParameters<typeof Outbox>[0]> = {}) {
  let clock = 1_000_000;
  let ids = 0;
  const outbox = new Outbox({
    storage: AsyncStorage,
    now: () => clock,
    createId: () => `op${++ids}`,
    baseDelayMs: 1_000,
    maxDelayMs: 8_000,
    maxAttempts: 3,
    ...overrides,
  });
  return {
    outbox,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const describeOp = (entry: OutboxEntry) =>
  entry.op.type === 'comment.create' ? `comment:${entry.op.body}` : `update:${JSON.stringify(entry.op.patch)}`;

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('Outbox persistence', () => {
  it('persists every enqueue to AsyncStorage and restores the queue after a restart', async () => {
    const { outbox } = makeOutbox();
    await outbox.enqueue(comment('t1', 'first'));
    await outbox.enqueue(statusChange('t1', 'resolved'));

    const raw = await AsyncStorage.getItem(OUTBOX_STORAGE_KEY);
    expect(JSON.parse(raw!).entries).toHaveLength(2);

    // Simulate an app restart: brand new instance, same storage.
    const { outbox: restored } = makeOutbox();
    await restored.hydrate();
    expect(restored.getEntries().map(describeOp)).toEqual(['comment:first', 'update:{"status":"resolved"}']);
  });

  it('discards a corrupt persisted queue instead of crashing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await AsyncStorage.setItem(OUTBOX_STORAGE_KEY, '{"version":1,"entries":[{"nope":true}]}');
    const { outbox } = makeOutbox();
    await outbox.hydrate();
    expect(outbox.size).toBe(0);
    expect(await AsyncStorage.getItem(OUTBOX_STORAGE_KEY)).toBeNull();
    warn.mockRestore();
  });

  it('keeps writes enqueued before hydration behind the persisted ones', async () => {
    const { outbox: first } = makeOutbox();
    await first.enqueue(comment('t1', 'old'));

    const { outbox } = makeOutbox({ createId: () => 'new-op' });
    await outbox.enqueue(comment('t1', 'new'));
    expect(outbox.getEntries().map(describeOp)).toEqual(['comment:old', 'comment:new']);
  });

  it('clear() empties memory and storage (used on logout)', async () => {
    const { outbox } = makeOutbox();
    await outbox.enqueue(comment('t1', 'x'));
    await outbox.clear();
    expect(outbox.size).toBe(0);
    expect(JSON.parse((await AsyncStorage.getItem(OUTBOX_STORAGE_KEY))!).entries).toEqual([]);
  });
});

describe('Outbox replay', () => {
  it('replays in FIFO order and removes each entry once acknowledged', async () => {
    const { outbox } = makeOutbox();
    await outbox.enqueue(comment('t1', 'a'));
    await outbox.enqueue(statusChange('t2', 'pending'));
    await outbox.enqueue(comment('t1', 'b'));

    const sent: string[] = [];
    const result = await outbox.replay(async (entry) => {
      sent.push(describeOp(entry));
      // While this entry is in flight it must still be persisted (crash-safety).
      expect(outbox.getEntries()[0]?.id).toBe(entry.id);
    });

    expect(sent).toEqual(['comment:a', 'update:{"status":"pending"}', 'comment:b']);
    expect(result.succeeded).toHaveLength(3);
    expect(result.remaining).toBe(0);
    expect(outbox.size).toBe(0);
  });

  it('stops at the first retryable failure to preserve ordering, with exponential backoff', async () => {
    const { outbox, advance } = makeOutbox();
    await outbox.enqueue(comment('t1', 'a'));
    await outbox.enqueue(comment('t1', 'b'));

    const executor = jest.fn().mockRejectedValueOnce(networkError());
    const first = await outbox.replay(executor);

    expect(executor).toHaveBeenCalledTimes(1);
    expect(first.blockedBy).toMatchObject({ attempts: 1, nextAttemptAt: 1_000_000 + 1_000, lastError: 'Network request failed' });
    expect(outbox.getEntries().map(describeOp)).toEqual(['comment:a', 'comment:b']);

    // Still in backoff: nothing is sent.
    const early = await outbox.replay(executor);
    expect(executor).toHaveBeenCalledTimes(1);
    expect(early.blockedBy?.id).toBe(first.blockedBy?.id);

    advance(1_000);
    executor.mockResolvedValue(undefined);
    const second = await outbox.replay(executor);
    expect(second.succeeded.map(describeOp)).toEqual(['comment:a', 'comment:b']);
    expect(outbox.size).toBe(0);
  });

  it('ignoreBackoff replays immediately (connectivity just came back)', async () => {
    const { outbox } = makeOutbox();
    await outbox.enqueue(comment('t1', 'a'));
    await outbox.replay(jest.fn().mockRejectedValue(networkError()));

    const executor = jest.fn().mockResolvedValue(undefined);
    await outbox.replay(executor, { ignoreBackoff: true });
    expect(executor).toHaveBeenCalledTimes(1);
    expect(outbox.size).toBe(0);
  });

  it('caps backoff delay', () => {
    const { outbox } = makeOutbox();
    expect([1, 2, 3, 4, 5, 6].map((n) => outbox.backoffDelay(n))).toEqual([1_000, 2_000, 4_000, 8_000, 8_000, 8_000]);
  });

  it('drops an entry after maxAttempts retryable failures and continues with the next', async () => {
    const { outbox, advance } = makeOutbox({ maxAttempts: 2 });
    await outbox.enqueue(comment('t1', 'doomed'));
    await outbox.enqueue(comment('t1', 'fine'));

    const executor = jest.fn(async (entry: OutboxEntry) => {
      if (entry.op.type === 'comment.create' && entry.op.body === 'doomed') throw networkError();
    });

    await outbox.replay(executor);
    advance(10_000);
    const result = await outbox.replay(executor);

    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]).toMatchObject({ reason: 'max_attempts', entry: { attempts: 2 } });
    expect(result.succeeded.map(describeOp)).toEqual(['comment:fine']);
    expect(outbox.size).toBe(0);
  });

  it('drops non-retryable rejections (e.g. 403) immediately without blocking the queue', async () => {
    const { outbox } = makeOutbox();
    await outbox.enqueue(statusChange('t1', 'resolved'));
    await outbox.enqueue(comment('t1', 'after'));

    const executor = jest.fn().mockRejectedValueOnce(forbiddenError()).mockResolvedValueOnce(undefined);
    const result = await outbox.replay(executor);

    expect(result.dropped).toEqual([expect.objectContaining({ reason: 'rejected' })]);
    expect(result.succeeded.map(describeOp)).toEqual(['comment:after']);
    expect(result.blockedBy).toBeNull();
  });

  it('shares a single in-flight run between concurrent replay() calls', async () => {
    const { outbox } = makeOutbox();
    await outbox.enqueue(comment('t1', 'once'));
    let release!: () => void;
    const executor = jest.fn(() => new Promise<void>((resolve) => (release = resolve)));

    const a = outbox.replay(executor);
    const b = outbox.replay(executor);
    await new Promise((r) => setImmediate(r));
    release();
    const [ra, rb] = await Promise.all([a, b]);

    expect(executor).toHaveBeenCalledTimes(1);
    expect(ra).toBe(rb);
  });

  it('persists the remaining queue after a partial replay', async () => {
    const { outbox } = makeOutbox();
    await outbox.enqueue(comment('t1', 'sent'));
    await outbox.enqueue(comment('t1', 'stuck'));
    await outbox.replay(async (entry) => {
      if (entry.op.type === 'comment.create' && entry.op.body === 'stuck') throw networkError();
    });

    const { outbox: restored } = makeOutbox();
    await restored.hydrate();
    expect(restored.getEntries().map(describeOp)).toEqual(['comment:stuck']);
    expect(restored.getEntries()[0]?.attempts).toBe(1);
  });
});

describe('Outbox coalescing', () => {
  it('merges repeated updates for the same ticket into the queued entry (last write wins)', async () => {
    const { outbox } = makeOutbox();
    await outbox.enqueue(statusChange('t1', 'pending'));
    await outbox.enqueue(comment('t1', 'note'));
    await outbox.enqueue({ type: 'ticket.update', ticketId: 't1', patch: { priority: 'urgent' } });
    await outbox.enqueue(statusChange('t1', 'resolved'));
    await outbox.enqueue(statusChange('t2', 'open'));

    expect(outbox.getEntries().map(describeOp)).toEqual([
      'update:{"status":"resolved","priority":"urgent"}',
      'comment:note',
      'update:{"status":"open"}',
    ]);
  });

  it('never merges into the entry that is currently in flight', async () => {
    const { outbox } = makeOutbox();
    await outbox.enqueue(statusChange('t1', 'pending'));

    const sent: string[] = [];
    await outbox.replay(async (entry) => {
      sent.push(describeOp(entry));
      if (sent.length === 1) await outbox.enqueue(statusChange('t1', 'resolved'));
    });

    expect(sent).toEqual(['update:{"status":"pending"}', 'update:{"status":"resolved"}']);
    expect(outbox.size).toBe(0);
  });
});

describe('optimistic overlay', () => {
  const ticket = {
    id: 't1',
    number: 1,
    subject: 's',
    description: 'd',
    status: 'open' as const,
    priority: 'low' as const,
    requester: { name: 'R', email: 'r@x.co' },
    assignee: null,
    tags: [],
    commentCount: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('applies queued patches and comment counts for the matching ticket only', async () => {
    const { outbox } = makeOutbox();
    await outbox.enqueue({ type: 'ticket.update', ticketId: 't1', patch: { status: 'resolved', assigneeId: 'u2' }, assignee: { id: 'u2', name: 'Bilal' } });
    await outbox.enqueue(comment('t1', 'hello', 'client-9'));
    await outbox.enqueue(statusChange('other', 'pending'));

    const shown = applyPendingToTicket(ticket, outbox.getEntries());
    expect(shown).toMatchObject({ status: 'resolved', assignee: { id: 'u2', name: 'Bilal' }, commentCount: 3 });

    const pending = pendingCommentsFor('t1', outbox.getEntries());
    expect(pending).toEqual([expect.objectContaining({ id: 'client-9', body: 'hello', pending: true })]);
  });
});
