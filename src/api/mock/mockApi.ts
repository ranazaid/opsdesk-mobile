import { canApplyPatch, can, type Permission } from '@/permissions/matrix';

import { ApiError } from '../errors';
import {
  aiSummarySchema,
  commentSchema,
  createTicketInputSchema,
  loginResponseSchema,
  ticketDetailSchema,
  ticketPageSchema,
  ticketSchema,
  updateTicketInputSchema,
  userSchema,
  type Comment,
  type Ticket,
  type TicketDetail,
} from '../schemas';
import type { OpsDeskApi } from '../types';
import { createSeed, toMember, type MockDb, type MockUser } from './seed';

export interface MockApiOptions {
  /** Artificial latency per call so loading states are visible in the demo. */
  latencyMs?: number;
  /** Extra latency for the AI summary endpoint, which is an LLM call in production. */
  aiLatencyMs?: number;
  pageSize?: number;
  now?: () => Date;
  db?: MockDb;
  getToken: () => string | null;
  onUnauthorized?: () => void;
  /** When true every call fails with a network error (demo "simulate offline"). */
  isOffline?: () => boolean;
}

export interface MockApi extends OpsDeskApi {
  readonly db: MockDb;
}

const TOKEN_PREFIX = 'demo.';

const wait = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

function forbidden(message = 'You do not have permission to do that.'): ApiError {
  return new ApiError({ kind: 'http', status: 403, code: 'forbidden', message });
}

function notFound(what: string): ApiError {
  return new ApiError({ kind: 'http', status: 404, code: 'not_found', message: `${what} not found` });
}

function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError({ kind: 'http', status: 400, code: 'bad_request', message, details });
}

function firstSentence(text: string): string {
  const match = /^(.+?[.!?])(\s|$)/.exec(text.trim());
  return (match?.[1] ?? text).trim();
}

/**
 * In-memory implementation of the OpsDesk API used in demo mode and tests.
 *
 * It behaves like the real backend where it matters for the client: bearer
 * token auth with 401s, cursor pagination, search, server-side permission
 * checks using the shared matrix, idempotent comment creation by `clientId`,
 * and every response is validated against the same zod schemas as HTTP.
 */
export function createMockApi(options: MockApiOptions): MockApi {
  const { latencyMs = 0, aiLatencyMs = latencyMs, pageSize = 15, now = () => new Date(), getToken, onUnauthorized, isOffline } = options;
  const db = options.db ?? createSeed(now());
  const commentsByClientId = new Map<string, Comment>();

  async function gate(extraLatency = 0): Promise<void> {
    await wait(latencyMs + extraLatency);
    if (isOffline?.()) throw new ApiError({ kind: 'network', message: 'Network request failed' });
  }

  function currentUser(): MockUser {
    const token = getToken();
    const user = token?.startsWith(TOKEN_PREFIX) ? db.users.find((u) => u.id === token.slice(TOKEN_PREFIX.length)) : undefined;
    if (!user) {
      onUnauthorized?.();
      throw new ApiError({ kind: 'unauthorized', status: 401, code: 'unauthorized', message: 'Your session has expired. Please sign in again.' });
    }
    return user;
  }

  function authorize(permission: Permission): MockUser {
    const user = currentUser();
    if (!can(user.role, permission)) throw forbidden();
    return user;
  }

  function findTicket(id: string): Ticket {
    const ticket = db.tickets.find((t) => t.id === id);
    if (!ticket) throw notFound('Ticket');
    return ticket;
  }

  function nextId(prefix: string): string {
    const id = `${prefix}_m${db.nextId.toString(36)}`;
    db.nextId += 1;
    return id;
  }

  function detail(ticket: Ticket): TicketDetail {
    const comments = db.comments
      .filter((c) => c.ticketId === ticket.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return ticketDetailSchema.parse({ ...ticket, comments });
  }

  return {
    db,

    async login(email, password) {
      await gate();
      const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
      if (!user || user.password !== password) {
        throw new ApiError({ kind: 'unauthorized', status: 401, code: 'invalid_credentials', message: 'Incorrect email or password.' });
      }
      const { password: _password, ...publicUser } = user;
      return loginResponseSchema.parse({ token: `${TOKEN_PREFIX}${user.id}`, user: publicUser });
    },

    async me() {
      await gate();
      const { password: _password, ...publicUser } = currentUser();
      return userSchema.parse(publicUser);
    },

    async listTickets({ status, q, cursor }) {
      await gate();
      authorize('ticket.view');
      const offset = cursor ? Number.parseInt(cursor, 10) : 0;
      if (!Number.isInteger(offset) || offset < 0) throw badRequest('Invalid cursor');

      const query = q?.trim().toLowerCase().replace(/^#/, '') ?? '';
      const matches = db.tickets
        .filter((t) => !status || t.status === status)
        .filter(
          (t) =>
            !query ||
            String(t.number).includes(query) ||
            t.subject.toLowerCase().includes(query) ||
            t.description.toLowerCase().includes(query) ||
            t.requester.name.toLowerCase().includes(query) ||
            t.requester.email.toLowerCase().includes(query) ||
            t.tags.some((tag) => tag.includes(query)),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.number - a.number);

      const items = matches.slice(offset, offset + pageSize);
      const nextOffset = offset + items.length;
      return ticketPageSchema.parse({ items, nextCursor: nextOffset < matches.length ? String(nextOffset) : null });
    },

    async getTicket(id) {
      await gate();
      authorize('ticket.view');
      return detail(findTicket(id));
    },

    async createTicket(input) {
      await gate();
      authorize('ticket.create');
      const parsed = createTicketInputSchema.safeParse(input);
      if (!parsed.success) throw badRequest('Invalid ticket', parsed.error.issues);
      const timestamp = now().toISOString();
      const email = parsed.data.requesterEmail;
      const ticket: Ticket = ticketSchema.parse({
        id: nextId('tkt'),
        number: db.nextTicketNumber,
        subject: parsed.data.subject,
        description: parsed.data.description,
        status: 'open',
        priority: parsed.data.priority,
        requester: { name: email.split('@')[0] ?? email, email },
        assignee: null,
        tags: [],
        commentCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      db.nextTicketNumber += 1;
      db.tickets.unshift(ticket);
      return ticket;
    },

    async updateTicket(id, patch) {
      await gate();
      const user = currentUser();
      const parsed = updateTicketInputSchema.safeParse(patch);
      if (!parsed.success) throw badRequest('Invalid patch', parsed.error.issues);
      if (!canApplyPatch(user.role, parsed.data)) throw forbidden();
      const ticket = findTicket(id);
      const { assigneeId, ...rest } = parsed.data;
      let assignee = ticket.assignee;
      if (assigneeId !== undefined) {
        const target = assigneeId === null ? null : db.users.find((u) => u.id === assigneeId);
        if (target === undefined) throw badRequest('Unknown assignee');
        assignee = target ? { id: target.id, name: target.name } : null;
      }
      const updated = ticketSchema.parse({ ...ticket, ...rest, assignee, updatedAt: now().toISOString() });
      db.tickets = db.tickets.map((t) => (t.id === id ? updated : t));
      return updated;
    },

    async addComment(ticketId, body, clientId) {
      await gate();
      const user = authorize('ticket.reply');
      const existing = commentsByClientId.get(clientId);
      if (existing) return existing; // idempotent replay
      const text = body.trim();
      if (!text) throw badRequest('Comment cannot be empty');
      const ticket = findTicket(ticketId);
      const timestamp = now().toISOString();
      const comment = commentSchema.parse({
        id: nextId('cmt'),
        ticketId,
        body: text,
        author: { id: user.id, name: user.name, kind: 'agent' },
        createdAt: timestamp,
      });
      db.comments.push(comment);
      commentsByClientId.set(clientId, comment);
      db.tickets = db.tickets.map((t) =>
        t.id === ticket.id ? { ...t, commentCount: t.commentCount + 1, updatedAt: timestamp } : t,
      );
      return comment;
    },

    async summarizeTicket(ticketId) {
      await gate(aiLatencyMs - latencyMs);
      authorize('ai.summarize');
      const ticket = detail(findTicket(ticketId));
      const customerMessages = ticket.comments.filter((c) => c.author.kind === 'customer');
      const lastCustomer = customerMessages[customerMessages.length - 1];
      const lastAgent = [...ticket.comments].reverse().find((c) => c.author.kind === 'agent');
      const firstName = ticket.requester.name.split(' ')[0] ?? ticket.requester.name;

      const summary = [
        `${ticket.requester.name} reports: ${firstSentence(ticket.description)}`,
        lastAgent ? `Latest from support (${lastAgent.author.name}): ${firstSentence(lastAgent.body)}` : 'No agent has replied yet.',
        lastCustomer ? `Customer follow-up: ${firstSentence(lastCustomer.body)}` : null,
        `Currently ${ticket.status} at ${ticket.priority} priority${ticket.assignee ? `, assigned to ${ticket.assignee.name}` : ', unassigned'}.`,
      ]
        .filter(Boolean)
        .join(' ');

      const suggestedReply =
        ticket.status === 'resolved'
          ? `Hi ${firstName}, just checking in to confirm everything is working as expected on your side. If anything comes up again, reply here and we will reopen the ticket.`
          : ticket.priority === 'urgent' || ticket.priority === 'high'
            ? `Hi ${firstName}, thanks for your patience. I have escalated this to our engineering team as a priority and will update you within the next 2 hours with progress.`
            : `Hi ${firstName}, thanks for the details. I am looking into this now and will follow up shortly with next steps.`;

      return aiSummarySchema.parse({ summary, suggestedReply });
    },

    async listMembers() {
      await gate();
      authorize('members.view');
      return db.users.map(toMember);
    },

    async registerPushToken() {
      await gate();
      currentUser();
    },
  };
}
