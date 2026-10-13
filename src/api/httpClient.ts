import type { z } from 'zod';

import { ApiError } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface HttpClientOptions {
  /** API origin, e.g. `https://opsdesk.example.com`. `/api/v1` is appended. */
  baseUrl: string;
  /** Returns the current bearer token, or null when signed out. */
  getToken: () => string | null;
  /** Called once per 401 response, after the error is created. */
  onUnauthorized?: () => void;
  timeoutMs?: number;
  /** Injectable for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface RequestOptions<S extends z.ZodType> {
  schema: S;
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  /** Skip the Authorization header (login). */
  anonymous?: boolean;
}

export interface HttpClient {
  request<S extends z.ZodType>(method: HttpMethod, path: string, options: RequestOptions<S>): Promise<z.output<S>>;
}

const API_PREFIX = '/api/v1';

export function buildUrl(baseUrl: string, path: string, query?: RequestOptions<z.ZodType>['query']): string {
  const url = `${baseUrl.replace(/\/+$/, '')}${API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return params.length ? `${url}?${params.join('&')}` : url;
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Normalise the server's error envelope. OpsDesk returns
 * `{ error: { code, message, details } }`, but proxies and older endpoints may
 * return `{ message }`, `{ error: "..." }` or plain text, so all are handled.
 */
export function parseErrorBody(body: unknown): { message?: string; code?: string; details?: unknown } {
  if (typeof body === 'string') return { message: body.slice(0, 200) };
  if (!body || typeof body !== 'object') return {};
  const record = body as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === 'object') {
    const inner = error as Record<string, unknown>;
    return {
      message: typeof inner.message === 'string' ? inner.message : undefined,
      code: typeof inner.code === 'string' ? inner.code : undefined,
      details: inner.details,
    };
  }
  return {
    message: typeof error === 'string' ? error : typeof record.message === 'string' ? record.message : undefined,
    code: typeof record.code === 'string' ? record.code : undefined,
  };
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const { baseUrl, getToken, onUnauthorized, timeoutMs = 15_000 } = options;

  return {
    async request(method, path, { schema, body, query, signal, anonymous }) {
      const fetchImpl = options.fetchImpl ?? fetch;
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      const onCallerAbort = () => controller.abort();
      signal?.addEventListener('abort', onCallerAbort);

      const headers: Record<string, string> = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const token = anonymous ? null : getToken();
      if (token) headers.Authorization = `Bearer ${token}`;

      let response: Response;
      try {
        response = await fetchImpl(buildUrl(baseUrl, path, query), {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (cause) {
        if (timedOut) {
          throw new ApiError({ kind: 'timeout', message: `Request timed out after ${timeoutMs}ms`, cause });
        }
        if (signal?.aborted) throw cause; // caller cancelled (e.g. TanStack Query unmount): propagate as-is
        throw new ApiError({ kind: 'network', message: 'Network request failed', cause });
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onCallerAbort);
      }

      const payload = await readBody(response).catch(() => null);

      if (!response.ok) {
        const parsed = parseErrorBody(payload);
        if (response.status === 401) {
          const error = new ApiError({
            kind: 'unauthorized',
            status: 401,
            code: parsed.code ?? 'unauthorized',
            message: parsed.message ?? 'Your session has expired. Please sign in again.',
          });
          // Login uses `anonymous`: a 401 there means bad credentials, not an expired session.
          if (!anonymous) onUnauthorized?.();
          throw error;
        }
        throw new ApiError({
          kind: 'http',
          status: response.status,
          code: parsed.code,
          details: parsed.details,
          message: parsed.message ?? `Request failed with status ${response.status}`,
        });
      }

      const result = schema.safeParse(payload);
      if (!result.success) {
        throw new ApiError({
          kind: 'validation',
          status: response.status,
          code: 'invalid_response',
          message: `Unexpected response from ${method} ${path}`,
          details: result.error.issues,
        });
      }
      return result.data;
    },
  };
}
