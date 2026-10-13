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
  const signOut = () => {
    token = null;
  };
  return { api, signInAs, signOut, onUnauthorized };
}

describe('mock API', () => {
  it('logs in demo users and returns schema-valid users with their role', async () => {
    const { api, signInAs } = setup();
    const { token, user } = await signInAs('Agent@OpsDesk.demo');
    expect(token).toMatch(/^demo\./);
    expect(user).toMatchObject({ role: 'agent', orgName: 'Acme Logistics' });
    expect(user).not.toHaveProperty('password');
    await expect(api.me()).resolves.toEqual(user);
  });

  it('rejects bad credentials with a 401 that does not count as a session expiry', async () => {
    const { api, onUnauthorized } = setup();
    await expect(api.login('agent@opsdesk.demo', 'wrong')).rejects.toMatchObject({ kind: 'unauthorized', code: 'invalid_credentials' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('returns 401 and signals unauthorized for calls without a valid token', async () => {
    const { api, onUnauthorized } = setup();
    await expect(api.listTickets({})).rejects.toMatchObject({ kind: 'unauthorized', status: 401 });
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('paginates with an opaque cursor until exhausted, without duplicates', async () => {
    const { api, signInAs } = setup();
    await signInAs('agent@opsdesk.demo');
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await api.listTickets({ cursor });
      seen.push(...page.items.map((t) => t.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(3); // 36 seeded tickets / 15 per page
    expect(new Set(seen).size).toBe(36);
  });

  it('filters by status and searches subject, requester and #number', async () => {
    const { api, signInAs } = setup();
    await signInAs('viewer@opsdesk.demo');
    const pending = await api.listTickets({ status: 'pending' });
    expect(pending.items.length).toBeGreaterThan(0);
    expect(pending.items.every((t) => t.status === 'pending')).toBe(true);

    const bySubject = await api.listTickets({ q: 'quickbooks' });
    expect(bySubject.items.every((t) => t.subject.toLowerCase().includes('quickbooks'))).toBe(true);

    const byNumber = await api.listTickets({ q: '#1003' });
    expect(byNumber.items.map((t) => t.number)).toContain(1003);
  });

  it('enforces the shared permission matrix server-side', async () => {
    const { api, signInAs } = setup();
    await signInAs('viewer@opsdesk.demo');
    await expect(api.updateTicket('tkt_rs', { status: 'resolved' })).rejects.toMatchObject({ status: 403 });
    await expect(api.addComment('tkt_rs', 'hi', 'c1')).rejects.toMatchObject({ status: 403 });

    await signInAs('agent@opsdesk.demo');
    await expect(api.updateTicket('tkt_rs', { status: 'resolved' })).resolves.toMatchObject({ status: 'resolved' });
    await expect(api.updateTicket('tkt_rs', { assigneeId: 'usr_agent2' })).rejects.toMatchObject({ status: 403 });

    await signInAs('admin@opsdesk.demo');
    await expect(api.updateTicket('tkt_rs', { assigneeId: 'usr_agent2' })).resolves.toMatchObject({
      assignee: { id: 'usr_agent2', name: 'Bilal Hussain' },
    });
  });

  it('adds comments idempotently by clientId and bumps the ticket', async () => {
    const { api, signInAs } = setup();
    await signInAs('agent@opsdesk.demo');
    const before = await api.getTicket('tkt_rs');
    const first = await api.addComment('tkt_rs', '  On it!  ', 'client-1');
    const replay = await api.addComment('tkt_rs', 'On it!', 'client-1');
    expect(replay.id).toBe(first.id);
    expect(first.body).toBe('On it!');

    const after = await api.getTicket('tkt_rs');
    expect(after.comments).toHaveLength(before.comments.length + 1);
    expect(after.commentCount).toBe(before.commentCount + 1);
    expect(after.comments[after.comments.length - 1]?.author.name).toBe('Ayesha Khan');
  });

  it('creates tickets with validation and puts them at the top of the list', async () => {
    const { api, signInAs } = setup();
    await signInAs('agent@opsdesk.demo');
    await expect(
      api.createTicket({ subject: 'x', description: 'too short', priority: 'low', requesterEmail: 'a@b.co' }),
    ).rejects.toMatchObject({ status: 400 });

    const created = await api.createTicket({
      subject: 'Label printer offline',
      description: 'The Zebra printer at dock 4 stopped printing labels.',
      priority: 'high',
      requesterEmail: 'dock4@northwind.example',
    });
    expect(created).toMatchObject({ number: 1037, status: 'open', assignee: null });
    const page = await api.listTickets({});
    expect(page.items[0]?.id).toBe(created.id);
  });

  it('produces an AI summary and suggested reply grounded in the ticket', async () => {
    const { api, signInAs } = setup();
    await signInAs('agent@opsdesk.demo');
    const { summary, suggestedReply } = await api.summarizeTicket('tkt_rs');
    const ticket = await api.getTicket('tkt_rs');
    expect(summary).toContain(ticket.requester.name);
    expect(suggestedReply).toMatch(new RegExp(`^Hi ${ticket.requester.name.split(' ')[0]}`));
  });

  it('fails every call with a retryable network error while simulated offline', async () => {
    const { api } = setup({ offline: true });
    const error = await api.login('agent@opsdesk.demo', DEMO_PASSWORD).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'network', retryable: true });
  });
});
