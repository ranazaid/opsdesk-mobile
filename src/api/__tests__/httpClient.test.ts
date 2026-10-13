import { z } from 'zod';

import { ApiError } from '../errors';
import { createHttpApi } from '../httpApi';
import { buildUrl, createHttpClient, parseErrorBody } from '../httpClient';

const okSchema = z.object({ ok: z.boolean() });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setup(fetchImpl: jest.Mock, token: string | null = 'tok_123', timeoutMs = 1000) {
  const onUnauthorized = jest.fn();
  const client = createHttpClient({
    baseUrl: 'https://opsdesk.test/',
    getToken: () => token,
    onUnauthorized,
    timeoutMs,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { client, onUnauthorized };
}

describe('buildUrl', () => {
  it('joins base, /api/v1 prefix and path, dropping empty query values', () => {
    expect(buildUrl('https://x.test/', '/tickets', { status: 'open', q: '', assignee: null, page: 2 })).toBe(
      'https://x.test/api/v1/tickets?status=open&page=2',
    );
  });

  it('encodes query values', () => {
    expect(buildUrl('https://x.test', 'tickets', { q: 'sso & okta' })).toBe('https://x.test/api/v1/tickets?q=sso%20%26%20okta');
  });
});

describe('createHttpClient', () => {
  it('sends the bearer token and JSON body, and returns schema-parsed data', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ ok: true, extra: 'stripped' }));
    const { client } = setup(fetchImpl);

    await expect(client.request('POST', '/things', { schema: okSchema, body: { a: 1 } })).resolves.toEqual({ ok: true });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://opsdesk.test/api/v1/things');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok_123');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
  });

  it('omits Authorization for anonymous requests', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const { client } = setup(fetchImpl);
    await client.request('POST', '/auth/login', { schema: okSchema, anonymous: true });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('maps 401 to an unauthorized ApiError and fires onUnauthorized (auto-logout)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ error: { code: 'token_expired', message: 'Token expired' } }, 401));
    const { client, onUnauthorized } = setup(fetchImpl);

    const error = await client.request('GET', '/me', { schema: okSchema }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'unauthorized', status: 401, code: 'token_expired', message: 'Token expired' });
    expect((error as ApiError).retryable).toBe(false);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not trigger logout when an anonymous login gets a 401 (bad credentials)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ message: 'Incorrect email or password.' }, 401));
    const { client, onUnauthorized } = setup(fetchImpl, null);

    await expect(client.request('POST', '/auth/login', { schema: okSchema, anonymous: true })).rejects.toMatchObject({
      kind: 'unauthorized',
      message: 'Incorrect email or password.',
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('rejects a 2xx body that fails zod validation with a validation ApiError', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ ok: 'yes' }));
    const { client } = setup(fetchImpl);

    const error = (await client.request('GET', '/things', { schema: okSchema }).catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.kind).toBe('validation');
    expect(error.code).toBe('invalid_response');
    expect(error.retryable).toBe(false);
    expect(Array.isArray(error.details)).toBe(true);
  });

  it('normalises server error envelopes and marks 5xx as retryable', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'forbidden', message: 'Nope' } }, 403))
      .mockResolvedValueOnce(new Response('upstream exploded', { status: 503 }));
    const { client } = setup(fetchImpl);

    await expect(client.request('GET', '/a', { schema: okSchema })).rejects.toMatchObject({
      kind: 'http',
      status: 403,
      code: 'forbidden',
      message: 'Nope',
      retryable: false,
    });
    await expect(client.request('GET', '/b', { schema: okSchema })).rejects.toMatchObject({
      kind: 'http',
      status: 503,
      message: 'upstream exploded',
      retryable: true,
    });
  });

  it('maps fetch rejections to a retryable network error', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    const { client } = setup(fetchImpl);
    await expect(client.request('GET', '/a', { schema: okSchema })).rejects.toMatchObject({ kind: 'network', retryable: true });
  });

  it('aborts slow requests with a timeout error', async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl = jest.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      );
      const { client } = setup(fetchImpl as unknown as jest.Mock, 'tok', 50);
      const pending = client.request('GET', '/slow', { schema: okSchema });
      jest.advanceTimersByTime(60);
      await expect(pending).rejects.toMatchObject({ kind: 'timeout', retryable: true });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('parseErrorBody', () => {
  it.each([
    [{ error: { code: 'x', message: 'm', details: [1] } }, { code: 'x', message: 'm', details: [1] }],
    [{ error: 'flat message' }, { message: 'flat message', code: undefined }],
    [{ message: 'top-level', code: 'c' }, { message: 'top-level', code: 'c' }],
    ['plain text', { message: 'plain text' }],
    [null, {}],
  ])('parses %p', (input, expected) => {
    expect(parseErrorBody(input)).toEqual(expected);
  });
});

describe('createHttpApi (opsdesk-web /api/v1 adapter)', () => {
  // Fixtures are shaped exactly like opsdesk-web's route handler responses.
  const wireTicket = {
    id: '6a1d7b0e-3c55-4c1e-9d0f-8b8f1c1d2e3f',
    orgId: 'f2b7d8a1-0000-4000-8000-000000000001',
    number: 1001,
    subject: 'Printer on fire',
    description: 'It is on fire.',
    status: 'open',
    priority: 'urgent',
    requesterName: 'Ann Lee',
    requesterEmail: 'ann@example.com',
    assigneeId: null,
    assigneeName: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    resolvedAt: null,
  };
  const wireComment = {
    id: 'c-1',
    orgId: wireTicket.orgId,
    ticketId: wireTicket.id,
    authorId: null,
    authorName: 'Ann Lee',
    body: 'Help',
    isInternal: false,
    createdAt: '2026-01-01T10:05:00.000Z',
  };

  function apiWith(...responses: unknown[]) {
    const fetchImpl = jest.fn();
    responses.forEach((body) => fetchImpl.mockResolvedValueOnce(jsonResponse(body)));
    return { api: createHttpApi(setup(fetchImpl).client), fetchImpl };
  }

  it('maps login { accessToken, user, organization } to a session', async () => {
    const { api, fetchImpl } = apiWith({
      accessToken: 'jwt.abc',
      tokenType: 'Bearer',
      expiresIn: 43200,
      user: { id: 'u1', email: 'aisha@northwind.test', name: 'Aisha Khan' },
      organization: { id: 'o1', name: 'Northwind Agency', plan: 'pro', role: 'agent' },
    });

    await expect(api.login('aisha@northwind.test', 'pw')).resolves.toEqual({
      token: 'jwt.abc',
      user: { id: 'u1', email: 'aisha@northwind.test', name: 'Aisha Khan', role: 'agent', orgId: 'o1', orgName: 'Northwind Agency', plan: 'pro' },
    });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('maps GET /me', async () => {
    const { api } = apiWith({
      user: { id: 'u1', email: 'victor@northwind.test', name: 'Victor Hughes' },
      organization: { id: 'o1', name: 'Northwind Agency', plan: 'pro' },
      role: 'viewer',
      permissions: ['ticket:read', 'audit:read', 'member:read'],
    });
    await expect(api.me()).resolves.toMatchObject({ role: 'viewer', orgName: 'Northwind Agency' });
  });

  it('sends page/pageSize/status/q and validates the page envelope', async () => {
    const { api, fetchImpl } = apiWith({ items: [wireTicket], total: 41, page: 2, pageSize: 20 });

    const page = await api.listTickets({ status: 'open', q: 'fire', page: 2 });

    expect(fetchImpl.mock.calls[0][0]).toBe('https://opsdesk.test/api/v1/tickets?status=open&q=fire&page=2&pageSize=20');
    expect(page).toMatchObject({ total: 41, page: 2, pageSize: 20 });
    expect(page.items[0]).not.toHaveProperty('orgId'); // unknown wire fields are stripped
  });

  it('combines { ticket } and { comments } into a ticket detail', async () => {
    const fetchImpl = jest.fn((url: string) =>
      Promise.resolve(jsonResponse(url.endsWith('/comments') ? { comments: [wireComment] } : { ticket: wireTicket })),
    );
    const api = createHttpApi(setup(fetchImpl as unknown as jest.Mock).client);

    const detail = await api.getTicket(wireTicket.id);

    expect(detail).toMatchObject({ id: wireTicket.id, description: 'It is on fire.', comments: [{ id: 'c-1', authorId: null }] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('unwraps { ticket } from POST /tickets (raw row without assigneeName) and PATCH', async () => {
    const { assigneeName: _omit, ...rawRow } = wireTicket;
    const { api, fetchImpl } = apiWith({ ticket: rawRow }, { ticket: { ...wireTicket, status: 'resolved' } });

    await expect(
      api.createTicket({ subject: 'Printer', description: 'On fire', requesterName: 'Ann', requesterEmail: 'ann@example.com', priority: 'urgent' }),
    ).resolves.toMatchObject({ number: 1001, assigneeName: null });
    await expect(api.updateTicket(wireTicket.id, { status: 'resolved' })).resolves.toMatchObject({ status: 'resolved' });
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: 'PATCH', body: '{"status":"resolved"}' });
  });

  it('posts replies as public comments and unwraps { comment }', async () => {
    const { api, fetchImpl } = apiWith({ comment: { ...wireComment, authorId: 'u1', authorName: 'Aisha Khan' } });
    await expect(api.addComment(wireTicket.id, 'On it', 'local-1')).resolves.toMatchObject({ authorName: 'Aisha Khan' });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ body: 'On it', isInternal: false });
  });

  it('builds the AI card from the summary and reply tasks', async () => {
    const fetchImpl = jest.fn((_url: string, init: RequestInit) => {
      const { task } = JSON.parse(String(init.body)) as { task: string };
      return Promise.resolve(jsonResponse({ task, text: task === 'summary' ? 'Short summary' : 'Hi Ann, ...', provider: 'mock', model: 'mock-1' }));
    });
    const api = createHttpApi(setup(fetchImpl as unknown as jest.Mock).client);

    await expect(api.summarizeTicket(wireTicket.id)).resolves.toEqual({ summary: 'Short summary', suggestedReply: 'Hi Ann, ...' });
  });

  it('unwraps { members } and posts push tokens', async () => {
    const { api, fetchImpl } = apiWith(
      { members: [{ userId: 'u1', name: 'Aisha Khan', email: 'aisha@northwind.test', role: 'agent', joinedAt: '2026-01-01T00:00:00.000Z' }] },
      { ok: true },
    );
    await expect(api.listMembers()).resolves.toHaveLength(1);
    await api.registerPushToken({ token: 'ExponentPushToken[abc]', platform: 'ios' });
    expect(fetchImpl.mock.calls[1][0]).toBe('https://opsdesk.test/api/v1/devices/push-token');
  });

  it('fails with a validation error when a ticket has an unknown status', async () => {
    const { api } = apiWith({ items: [{ ...wireTicket, status: 'archived' }], total: 1, page: 1, pageSize: 20 });
    await expect(api.listTickets({})).rejects.toMatchObject({ kind: 'validation' });
  });
});
