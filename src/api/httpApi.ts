import type { HttpClient } from './httpClient';
import {
  aiSummarySchema,
  commentSchema,
  loginResponseSchema,
  membersResponseSchema,
  pushRegistrationSchema,
  ticketDetailSchema,
  ticketPageSchema,
  ticketSchema,
  userSchema,
} from './schemas';
import type { OpsDeskApi } from './types';

/** REST implementation of {@link OpsDeskApi} against `${EXPO_PUBLIC_API_URL}/api/v1`. */
export function createHttpApi(client: HttpClient): OpsDeskApi {
  return {
    login: (email, password) =>
      client.request('POST', '/auth/login', { schema: loginResponseSchema, body: { email, password }, anonymous: true }),

    me: () => client.request('GET', '/me', { schema: userSchema }),

    listTickets: ({ status, q, cursor }, signal) =>
      client.request('GET', '/tickets', { schema: ticketPageSchema, query: { status, q, cursor }, signal }),

    getTicket: (id, signal) =>
      client.request('GET', `/tickets/${encodeURIComponent(id)}`, { schema: ticketDetailSchema, signal }),

    createTicket: (input) => client.request('POST', '/tickets', { schema: ticketSchema, body: input }),

    updateTicket: (id, patch) =>
      client.request('PATCH', `/tickets/${encodeURIComponent(id)}`, { schema: ticketSchema, body: patch }),

    // `clientId` doubles as an idempotency key so an outbox replay after a
    // lost response cannot create the same comment twice.
    addComment: (ticketId, body, clientId) =>
      client.request('POST', `/tickets/${encodeURIComponent(ticketId)}/comments`, {
        schema: commentSchema,
        body: { body, clientId },
      }),

    summarizeTicket: (ticketId) => client.request('POST', '/ai/summary', { schema: aiSummarySchema, body: { ticketId } }),

    listMembers: async () => (await client.request('GET', '/members', { schema: membersResponseSchema })).items,

    registerPushToken: async (registration) => {
      await client.request('POST', '/devices/push-token', { schema: pushRegistrationSchema, body: registration });
    },
  };
}
