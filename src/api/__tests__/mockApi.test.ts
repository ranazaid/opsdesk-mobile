import { ApiError } from '../errors';
import { createMockApi } from '../mock/mockApi';
import { DEMO_PASSWORD } from '../mock/seed';

const NOW = new Date('2026-10-01T12:00:00.000Z');

function setup(options: { offline?: boolean } = {}) {
  let token: string | null = null;
  const onUnauthorized = jest.fn();
  const api = createMockApi({
    now: () => NOW,
    getToken: () => token,
    onUnauthorized,
    isOffline: () => options.offline ?? false,
  });
  const signInAs = async (email: string) => {
    const result = await api.login(email, DEMO_PASSWORD);
    token = result.token;
    return result;
  };
  return { api, signInAs, onUnauthorized };
}

const newTicket = {
  subject: 'Label printer offline',
  description: 'The Zebra printer at dock 4 stopped printing labels.',
  requesterName: 'Dock Four',
  requesterEmail: 'dock4@northwind.example',
  priority: 'high' as const,
};

describe('mock API (demo backend)', () => {
  it('logs in with the same demo accounts as opsdesk-web and returns the role', async () => {
    const { api, signInAs } = setup();
    const { token, user } = await signInAs('Aisha@Northwind.test');
    expect(token).toMatch(/^demo\./);
    expect(user).toMatchObject({ name: 'Aisha Khan', role: 'agent', orgName: 'Northwind Agency', plan: 'pro' });
    expect(user).not.toHaveProperty('password');
    await expect(api.me()).resolves.toEqual(user);
  });

  it('rejects bad credentials with a 401 that does not count as a session expiry', async () => {
    const { api, onUnauthorized } = setup();
    await expect(api.login('aisha@northwind.test', 'wrong')).rejects.toMatchObject({ kind: 'unauthorized', message: 'Invalid email or password' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('returns 401 and signals unauthorized for calls without a valid token', async () => {
    const { api, onUnauthorized } = setup();
    await expect(api.listTickets({})).rejects.toMatchObject({ kind: 'unauthorized', status: 401 });
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('paginates with page/pageSize/total like opsdesk-web, without duplicates', async () => {
    const { api, signInAs } = setup();
    await signInAs('aisha@northwind.test');
    const first = await api.listTickets({});
    const second = await api.listTickets({ page: 2 });
    const third = await api.listTickets({ page: 3 });

    expect(first).toMatchObject({ total: 36, page: 1, pageSize: 20 });
    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(16);
    expect(third.items).toHaveLength(0);
    expect(new Set([...first.items, ...second.items].map((t) => t.id)).size).toBe(36);
  });

  it('filters by status and searches subject, requester and #number', async () => {
    const { api, signInAs } = setup();
    await signInAs('victor@northwind.test');
    for (const status of ['pending', 'closed'] as const) {
      const page = await api.listTickets({ status });
      expect(page.items.length).toBeGreaterThan(0);
      expect(page.items.every((t) => t.status === status)).toBe(true);
    }

    const bySubject = await api.listTickets({ q: 'quickbooks' });
    expect(bySubject.items.every((t) => t.subject.toLowerCase().includes('quickbooks'))).toBe(true);

    const byNumber = await api.listTickets({ q: '#1003' });
    expect(byNumber.items.map((t) => t.number)).toEqual([1003]);
  });

  it('enforces the shared permission matrix server-side (403 forbidden)', async () => {
    const { api, signInAs } = setup();
    await signInAs('victor@northwind.test');
    await expect(api.updateTicket('tkt_rs', { status: 'resolved' })).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    await expect(api.addComment('tkt_rs', 'hi', 'c1')).rejects.toMatchObject({ status: 403 });
    await expect(api.summarizeTicket('tkt_rs')).rejects.toMatchObject({ status: 403 });

    await signInAs('aisha@northwind.test');
    await expect(api.updateTicket('tkt_rs', { status: 'resolved' })).resolves.toMatchObject({ status: 'resolved', resolvedAt: NOW.toISOString() });
    // Agents hold ticket:assign in opsdesk-web's matrix.
    await expect(api.updateTicket('tkt_rs', { assigneeId: 'usr_agent2' })).resolves.toMatchObject({
      assigneeId: 'usr_agent2',
      assigneeName: 'Marco Rossi',
    });
  });

  it('refuses to assign tickets to viewers or non-members (422)', async () => {
    const { api, signInAs } = setup();
    await signInAs('adam@northwind.test');
    await expect(api.updateTicket('tkt_rs', { assigneeId: 'usr_viewer' })).rejects.toMatchObject({ status: 422 });
    await expect(api.updateTicket('tkt_rs', { assigneeId: 'nobody' })).rejects.toMatchObject({ status: 422 });
    await expect(api.updateTicket('tkt_rs', { assigneeId: null })).resolves.toMatchObject({ assigneeId: null, assigneeName: null });
  });

  it('adds public replies, dedupes outbox replays by clientId and bumps the ticket', async () => {
    const { api, signInAs } = setup();
    await signInAs('aisha@northwind.test');
    const before = await api.getTicket('tkt_rs');
    const first = await api.addComment('tkt_rs', '  On it!  ', 'client-1');
    const replay = await api.addComment('tkt_rs', 'On it!', 'client-1');
    expect(replay.id).toBe(first.id);
    expect(first).toMatchObject({ body: 'On it!', authorName: 'Aisha Khan', isInternal: false });

    const after = await api.getTicket('tkt_rs');
    expect(after.comments).toHaveLength(before.comments.length + 1);
  });

  it('includes customer messages (authorId null) and internal notes in the thread', async () => {
    const { api, signInAs } = setup();
    await signInAs('aisha@northwind.test');
    const ticket = await api.getTicket('tkt_rt'); // #1002
    expect(ticket.comments.some((c) => c.authorId === null)).toBe(true);
    expect(ticket.comments.some((c) => c.isInternal)).toBe(true);
  });

  it('creates tickets with validation and puts them at the top of the list', async () => {
    const { api, signInAs } = setup();
    await signInAs('aisha@northwind.test');
    await expect(api.createTicket({ ...newTicket, subject: 'x' })).rejects.toMatchObject({ status: 422, code: 'validation_failed' });

    const created = await api.createTicket(newTicket);
    expect(created).toMatchObject({ number: 1037, status: 'open', assigneeId: null, requesterName: 'Dock Four' });
    const page = await api.listTickets({});
    expect(page.items[0]?.id).toBe(created.id);
  });

  it('produces an AI summary and suggested reply grounded in the ticket', async () => {
    const { api, signInAs } = setup();
    await signInAs('aisha@northwind.test');
    const { summary, suggestedReply } = await api.summarizeTicket('tkt_rs');
    const ticket = await api.getTicket('tkt_rs');
    expect(summary).toContain(ticket.requesterName);
    expect(suggestedReply).toMatch(new RegExp(`^Hi ${ticket.requesterName.split(' ')[0]}`));
  });

  it('lists organization members', async () => {
    const { api, signInAs } = setup();
    await signInAs('victor@northwind.test');
    const members = await api.listMembers();
    expect(members.map((m) => m.name)).toContain('Marco Rossi');
    expect(members.find((m) => m.userId === 'usr_viewer')?.role).toBe('viewer');
  });

  it('fails every call with a retryable network error while simulated offline', async () => {
    const { api } = setup({ offline: true });
    const error = await api.login('aisha@northwind.test', DEMO_PASSWORD).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'network', retryable: true });
  });
});
