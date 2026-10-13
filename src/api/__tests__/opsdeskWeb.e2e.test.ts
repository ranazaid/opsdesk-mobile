/**
 * @jest-environment node
 */
import { request as httpRequest } from 'node:http';

import { ApiError } from '../errors';
import { createHttpApi } from '../httpApi';
import { createHttpClient } from '../httpClient';

/**
 * Contract test against a running opsdesk-web (`npm run db:seed && npm run dev`).
 * Skipped unless OPSDESK_E2E_URL is set:
 *
 *   OPSDESK_E2E_URL=http://localhost:3000 npm run test:e2e
 *
 * It drives the real HTTP adapter through the mobile app's whole flow, so any
 * drift between the two repos' contracts fails here.
 */
const baseUrl = process.env.OPSDESK_E2E_URL;
const describeLive = baseUrl ? describe : describe.skip;

const PASSWORD = 'opsdesk-demo'; // opsdesk-web demo seed

/**
 * jest-expo swaps the global fetch for Expo's native-backed implementation,
 * which has no network in Node. This minimal node:http transport provides the
 * subset of fetch the API client uses (status, ok, text, abort signal).
 */
const nodeFetch = ((input: string, init: RequestInit = {}) =>
  new Promise<Response>((resolve, reject) => {
    const req = httpRequest(
      input,
      { method: init.method ?? 'GET', headers: init.headers as Record<string, string>, signal: init.signal ?? undefined },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;
          resolve({ status, ok: status >= 200 && status < 300, text: async () => text } as Response);
        });
      },
    );
    req.on('error', reject);
    if (typeof init.body === 'string') req.write(init.body);
    req.end();
  })) as unknown as typeof fetch;

function client() {
  let token: string | null = null;
  const onUnauthorized = jest.fn();
  const api = createHttpApi(
    createHttpClient({ baseUrl: baseUrl ?? 'http://localhost', getToken: () => token, onUnauthorized, timeoutMs: 30_000, fetchImpl: nodeFetch }),
  );
  return {
    api,
    onUnauthorized,
    setToken: (next: string | null) => {
      token = next;
    },
  };
}

describeLive('opsdesk-web /api/v1 (live)', () => {
  jest.setTimeout(60_000);

  it('runs the agent flow: login -> list -> detail -> reply -> status -> AI -> members -> push token', async () => {
    const { api, setToken } = client();

    const session = await api.login('aisha@northwind.test', PASSWORD);
    expect(session.user).toMatchObject({ name: 'Aisha Khan', role: 'agent', orgName: 'Northwind Agency' });
    setToken(session.token);
    await expect(api.me()).resolves.toMatchObject({ id: session.user.id, role: 'agent' });

    const page = await api.listTickets({ status: 'open', pageSize: 5 });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((ticket) => ticket.status === 'open')).toBe(true);
    expect(page.total).toBeGreaterThanOrEqual(page.items.length);
    if (page.total > 5) {
      const next = await api.listTickets({ status: 'open', page: 2, pageSize: 5 });
      expect(next.items.map((t) => t.id)).not.toContain(page.items[0]!.id);
    }

    const ticketId = page.items[0]!.id;
    const detail = await api.getTicket(ticketId);
    expect(detail.description.length).toBeGreaterThan(0);
    const threadLength = detail.comments.length;

    const body = `Mobile e2e reply ${Date.now()}`;
    const comment = await api.addComment(ticketId, body, 'e2e-client-id');
    expect(comment).toMatchObject({ ticketId, body, authorName: 'Aisha Khan', isInternal: false });
    const thread = (await api.getTicket(ticketId)).comments;
    expect(thread).toHaveLength(threadLength + 1);
    expect(thread.at(-1)?.body).toBe(body);

    const updated = await api.updateTicket(ticketId, { status: 'pending', priority: 'high' });
    expect(updated).toMatchObject({ id: ticketId, status: 'pending', priority: 'high' });

    const ai = await api.summarizeTicket(ticketId);
    expect(ai.summary.length).toBeGreaterThan(20);
    expect(ai.suggestedReply.length).toBeGreaterThan(20);

    const members = await api.listMembers();
    expect(members.map((m) => m.email)).toEqual(expect.arrayContaining(['aisha@northwind.test', 'victor@northwind.test']));
    const marco = members.find((m) => m.email === 'marco@northwind.test')!;

    // Agents hold ticket:assign in the shared RBAC matrix.
    const reassigned = await api.updateTicket(ticketId, { assigneeId: marco.userId });
    expect(reassigned).toMatchObject({ assigneeId: marco.userId, assigneeName: 'Marco Rossi' });

    await expect(
      api.registerPushToken({ token: `ExponentPushToken[e2e${Date.now()}abcdefgh]`, platform: 'ios' }),
    ).resolves.toBeUndefined();

    const created = await api.createTicket({
      subject: 'Created from the mobile e2e test',
      description: 'Checks POST /tickets and the { ticket } envelope.',
      requesterName: 'E2E Bot',
      requesterEmail: 'e2e@example.com',
      priority: 'low',
    });
    expect(created).toMatchObject({ status: 'open', priority: 'low', assigneeName: null });
  });

  it('enforces RBAC for viewers (403) and maps a bad token to unauthorized (401)', async () => {
    const { api, setToken, onUnauthorized } = client();
    const viewer = await api.login('victor@northwind.test', PASSWORD);
    setToken(viewer.token);
    const [ticket] = (await api.listTickets({ pageSize: 1 })).items;

    const forbidden = (await api.updateTicket(ticket!.id, { status: 'resolved' }).catch((e: unknown) => e)) as ApiError;
    expect(forbidden).toBeInstanceOf(ApiError);
    expect(forbidden).toMatchObject({ kind: 'http', status: 403, code: 'forbidden', retryable: false });

    setToken('not-a-valid-token');
    await expect(api.me()).rejects.toMatchObject({ kind: 'unauthorized', status: 401 });
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('rejects bad credentials without triggering logout', async () => {
    const { api, onUnauthorized } = client();
    await expect(api.login('aisha@northwind.test', 'wrong-password')).rejects.toMatchObject({ kind: 'unauthorized', status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
