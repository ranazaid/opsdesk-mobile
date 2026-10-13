/**
 * Maps a push payload to an in-app route. Kept free of native imports so it can
 * be unit tested and reused by universal links later.
 *
 * Accepted payloads: `{ ticketId: "tkt_123" }` or
 * `{ url: "opsdesk://tickets/tkt_123" | "https://<host>/tickets/tkt_123" }`.
 * Anything else (including ids with path characters) is ignored.
 */
export function routeFromNotificationData(data: unknown): `/tickets/${string}` | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const isSafeId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);

  if (isSafeId(record.ticketId)) return `/tickets/${record.ticketId}`;
  if (typeof record.url === 'string') {
    const match = /^(?:opsdesk:\/\/|https?:\/\/[^/]+\/)?\/?tickets\/([A-Za-z0-9_-]{1,64})\/?$/.exec(record.url);
    if (match?.[1]) return `/tickets/${match[1]}`;
  }
  return null;
}
