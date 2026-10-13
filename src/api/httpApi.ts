import type { HttpClient } from './httpClient';
import {
  aiResponseSchema,
  commentEnvelopeSchema,
  commentsEnvelopeSchema,
  DEFAULT_PAGE_SIZE,
  loginResponseSchema,
  meResponseSchema,
  membersEnvelopeSchema,
  okResponseSchema,
  ticketEnvelopeSchema,
  ticketPageSchema,
  type AiTask,
} from './schemas';
import type { OpsDeskApi } from './types';

/**
 * Adapter for opsdesk-web's REST API (`${EXPO_PUBLIC_API_URL}/api/v1`).
 * Unwraps response envelopes and maps wire shapes to the app's domain types.
 */
export function createHttpApi(client: HttpClient): OpsDeskApi {
  const ticketPath = (id: string) => `/tickets/${encodeURIComponent(id)}`;

  const ai = (ticketId: string, task: AiTask) =>
    client.request('POST', '/ai/summary', { schema: aiResponseSchema, body: { ticketId, task, stream: false } });

  return {
    async login(email, password) {
      const { accessToken, user, organization } = await client.request('POST', '/auth/login', {
        schema: loginResponseSchema,
        body: { email, password },
        anonymous: true,
      });
      return {
        token: accessToken,
        user: { ...user, role: organization.role, orgId: organization.id, orgName: organization.name, plan: organization.plan },
      };
    },

    async me() {
      const { user, organization, role } = await client.request('GET', '/me', { schema: meResponseSchema });
      return { ...user, role, orgId: organization.id, orgName: organization.name, plan: organization.plan };
    },

    listTickets: ({ status, q, page = 1, pageSize = DEFAULT_PAGE_SIZE }, signal) =>
      client.request('GET', '/tickets', { schema: ticketPageSchema, query: { status, q, page, pageSize }, signal }),

    // The thread is a separate resource on the server; fetch both in parallel.
    async getTicket(id, signal) {
      const [{ ticket }, { comments }] = await Promise.all([
        client.request('GET', ticketPath(id), { schema: ticketEnvelopeSchema, signal }),
        client.request('GET', `${ticketPath(id)}/comments`, { schema: commentsEnvelopeSchema, signal }),
      ]);
      return { ...ticket, comments };
    },

    createTicket: async (input) => (await client.request('POST', '/tickets', { schema: ticketEnvelopeSchema, body: input })).ticket,

    updateTicket: async (id, patch) =>
      (await client.request('PATCH', ticketPath(id), { schema: ticketEnvelopeSchema, body: patch })).ticket,

    addComment: async (ticketId, body) =>
      (
        await client.request('POST', `${ticketPath(ticketId)}/comments`, {
          schema: commentEnvelopeSchema,
          body: { body, isInternal: false },
        })
      ).comment,

    // One endpoint, two tasks: a summary for the agent and a draft reply for the customer.
    async summarizeTicket(ticketId) {
      const [summary, reply] = await Promise.all([ai(ticketId, 'summary'), ai(ticketId, 'reply')]);
      return { summary: summary.text, suggestedReply: reply.text };
    },

    listMembers: async () => (await client.request('GET', '/members', { schema: membersEnvelopeSchema })).members,

    async registerPushToken(registration) {
      await client.request('POST', '/devices/push-token', { schema: okResponseSchema, body: registration });
    },
  };
}
