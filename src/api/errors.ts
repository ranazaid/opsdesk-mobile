export type ApiErrorKind =
  /** No response: DNS failure, connection refused, device offline. */
  | 'network'
  /** Request aborted by the client-side timeout. */
  | 'timeout'
  /** 401: token missing, expired or revoked. Triggers automatic logout. */
  | 'unauthorized'
  /** Any other non-2xx response. */
  | 'http'
  /** 2xx response whose body does not match the expected zod schema. */
  | 'validation';

export interface ApiErrorInit {
  kind: ApiErrorKind;
  message: string;
  status?: number;
  code?: string;
  details?: unknown;
  cause?: unknown;
}

/**
 * The only error type that leaves the API layer. Screens and hooks never have to
 * reason about `TypeError: Network request failed`, `AbortError` or zod issues:
 * they get a kind, a user-presentable message and a `retryable` flag.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    if (init.cause !== undefined) {
      (this as { cause?: unknown }).cause = init.cause;
    }
  }

  /**
   * Whether repeating the same request later could succeed. Used by the outbox
   * (keep the op and back off) and by TanStack Query's retry policy.
   */
  get retryable(): boolean {
    if (this.kind === 'network' || this.kind === 'timeout') return true;
    if (this.kind === 'http' && this.status !== undefined) {
      return this.status === 408 || this.status === 429 || this.status >= 500;
    }
    return false;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Human-readable message for any thrown value. */
export function errorMessage(error: unknown): string {
  if (isApiError(error)) {
    switch (error.kind) {
      case 'network':
        return 'You appear to be offline. Check your connection and try again.';
      case 'timeout':
        return 'The server took too long to respond. Please try again.';
      case 'validation':
        return 'The server sent an unexpected response. Please update the app or try again later.';
      default:
        return error.message;
    }
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
