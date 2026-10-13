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
    expect(buildUrl('https://x.test/', '/tickets', { status: 'open', q: '', cursor: null, page: 2 })).toBe(
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

describe('createHttpApi', () => {
  it('validates ticket pages and forwards list filters as query params', async () => {
    const page = {
      items: [
        {
          id: 't1',
          number: 1001,
          subject: 'Printer on fire',
          description: 'It is on fire.',
          status: 'open',
          priority: 'urgent',
          requester: { name: 'Ann', email: 'ann@example.com' },
          assignee: null,
          commentCount: 0,
          createdAt: '2026-01-01T10:00:00.000Z',
          updatedAt: '2026-01-01T10:00:00.000Z',
        },
      ],
      nextCursor: 'abc',
    };
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(page));
    const { client } = setup(fetchImpl);
    const api = createHttpApi(client);

    const result = await api.listTickets({ status: 'open', q: 'fire', cursor: null });

    expect(fetchImpl.mock.calls[0][0]).toBe('https://opsdesk.test/api/v1/tickets?status=open&q=fire');
    expect(result.items[0]?.tags).toEqual([]); // default applied by schema
    expect(result.nextCursor).toBe('abc');
  });

  it('fails with a validation error when a ticket has an unknown status', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ items: [{ id: 't1', status: 'archived' }], nextCursor: null }));
    const api = createHttpApi(setup(fetchImpl).client);
    await expect(api.listTickets({})).rejects.toMatchObject({ kind: 'validation' });
  });
});
