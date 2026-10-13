import { can, canApplyPatch, isAssignable, type Permission } from '@/permissions/matrix';

import { ApiError } from '../errors';
import {
  aiSummarySchema,
  commentSchema,
  createTicketInputSchema,
  DEFAULT_PAGE_SIZE,
  memberSchema,
  ticketDetailSchema,
  ticketPageSchema,
  ticketSchema,
  updateTicketInputSchema,
  userSchema,
  type Comment,
  type TicketDetail,
} from '../schemas';
import type { OpsDeskApi } from '../types';
import { createSeed, toMember, toPublicUser, type MockDb, type MockTicket, type MockUser } from './seed';

export interface MockApiOptions {
  /** Artificial latency per call so loading states are visible in the demo. */
  latencyMs?: number;
  /** Extra latency for the AI summary endpoint, which is an LLM call in production. */
  aiLatencyMs?: number;
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

// Same status codes and error codes as opsdesk-web (src/server/errors.ts).
function forbidden(permission: Permission, role: string): ApiError {
  return new ApiError({ kind: 'http', status: 403, code: 'forbidden', message: `Your role (${role}) does not allow ${permission}` });
}

function notFound(what: string): ApiError {
  return new ApiError({ kind: 'http', status: 404, code: 'not_found', message: `${what} not found` });
}

function validationFailed(message: string, details?: unknown): ApiError {
  return new ApiError({ kind: 'http', status: 422, code: 'validation_failed', message, details });
}

function firstSentence(text: string): string {
  const match = /^(.+?[.!?])(\s|$)/.exec(text.trim());
  return (match?.[1] ?? text).trim();
}

/**
 * In-memory implementation of the OpsDesk API used in demo mode and tests.
 *
 * It behaves like opsdesk-web where it matters for the client: bearer-token
 * auth with 401s, page-based lists ordered by last update, search by subject /
 * requester / #number, server-side permission checks with the same RBAC
 * matrix, 403/404/422 error codes, and responses validated against the same
 * zod schemas the HTTP adapter uses.
 */
export function createMockApi(options: MockApiOptions): MockApi {
  const { latencyMs = 0, aiLatencyMs = latencyMs, now = () => new Date(), getToken, onUnauthorized, isOffline } = options;
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
    if (!can(user.role, permission)) throw forbidden(permission, user.role);
    return user;
  }

  function findTicket(id: string): MockTicket {
    const ticket = db.tickets.find((t) => t.id === id);
    if (!ticket) throw notFound('Ticket');
    return ticket;
  }

  function nextId(prefix: string): string {
    const id = `${prefix}_m${db.nextId.toString(36)}`;
    db.nextId += 1;
    return id;
  }

  function detail(ticket: MockTicket): TicketDetail {
    const comments = db.comments
      .filter((c) => c.ticketId === ticket.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return ticketDetailSchema.parse({ ...ticket, comments });
  }

  function touch(ticketId: string, changes: Partial<MockTicket>) {
    db.tickets = db.tickets.map((t) => (t.id === ticketId ? { ...t, ...changes, updatedAt: now().toISOString() } : t));
    return findTicket(ticketId);
  }

  return {
    db,

    async login(email, password) {
      await gate();
      const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
      if (!user || user.password !== password) {
        throw new ApiError({ kind: 'unauthorized', status: 401, code: 'unauthorized', message: 'Invalid email or password' });
      }
      return { token: `${TOKEN_PREFIX}${user.id}`, user: userSchema.parse(toPublicUser(user)) };
    },

    async me() {
      await gate();
      return userSchema.parse(toPublicUser(currentUser()));
    },

    async listTickets({ status, q, page = 1, pageSize = DEFAULT_PAGE_SIZE }) {
      await gate();
      authorize('ticket:read');
      if (!Number.isInteger(page) || page < 1) throw validationFailed('Invalid page');

      const query = q?.trim().toLowerCase() ?? '';
      const number = Number.parseInt(query.replace(/^#/, ''), 10);
      const matches = db.tickets
        .filter((t) => !status || t.status === status)
        .filter(
          (t) =>
            !query ||
            (Number.isFinite(number) && t.number === number) ||
            t.subject.toLowerCase().includes(query) ||
            t.requesterName.toLowerCase().includes(query) ||
            t.requesterEmail.toLowerCase().includes(query),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.number - a.number);

      const items = matches.slice((page - 1) * pageSize, page * pageSize).map((ticket) => ticketSchema.parse(ticket));
      return ticketPageSchema.parse({ items, total: matches.length, page, pageSize });
    },

    async getTicket(id) {
      await gate();
      authorize('ticket:read');
      return detail(findTicket(id));
    },

    async createTicket(input) {
      await gate();
      authorize('ticket:create');
      const parsed = createTicketInputSchema.safeParse(input);
      if (!parsed.success) throw validationFailed('Validation failed', parsed.error.issues);
      const timestamp = now().toISOString();
      const ticket: MockTicket = {
        id: nextId('tkt'),
        number: db.nextTicketNumber,
        ...parsed.data,
        status: 'open',
        assigneeId: null,
        assigneeName: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        resolvedAt: null,
      };
      db.nextTicketNumber += 1;
      db.tickets.unshift(ticket);
      return ticketSchema.parse(ticket);
    },

    async updateTicket(id, patch) {
      await gate();
      const user = currentUser();
      const parsed = updateTicketInputSchema.safeParse(patch);
      if (!parsed.success) throw validationFailed('Provide at least one field to update', parsed.error.issues);
      if (!canApplyPatch(user.role, parsed.data)) {
        throw forbidden(parsed.data.assigneeId !== undefined ? 'ticket:assign' : 'ticket:update', user.role);
      }
      const current = findTicket(id);
      const { assigneeId, status, priority } = parsed.data;
      const changes: Partial<MockTicket> = {};
      if (status) {
        changes.status = status;
        changes.resolvedAt = status === 'resolved' || status === 'closed' ? (current.resolvedAt ?? now().toISOString()) : null;
      }
      if (priority) changes.priority = priority;
      if (assigneeId !== undefined) {
        const target = assigneeId === null ? null : db.users.find((u) => u.id === assigneeId);
        if (target === undefined) throw validationFailed('Assignee is not a member of this organization');
        if (target && !isAssignable(target.role)) throw validationFailed('Viewers cannot be assigned tickets');
        changes.assigneeId = target?.id ?? null;
        changes.assigneeName = target?.name ?? null;
      }
      return ticketSchema.parse(touch(id, changes));
    },

    async addComment(ticketId, body, clientId) {
      await gate();
      const user = authorize('comment:create');
      const existing = commentsByClientId.get(clientId);
      if (existing) return existing;
      const text = body.trim();
      if (!text) throw validationFailed('Message cannot be empty');
      findTicket(ticketId);
      const comment = commentSchema.parse({
        id: nextId('cmt'),
        ticketId,
        authorId: user.id,
        authorName: user.name,
        body: text,
        isInternal: false,
        createdAt: now().toISOString(),
      });
      db.comments.push(comment);
      commentsByClientId.set(clientId, comment);
      touch(ticketId, {});
      return comment;
    },

    async summarizeTicket(ticketId) {
      await gate(aiLatencyMs - latencyMs);
      authorize('ai:use');
      const ticket = detail(findTicket(ticketId));
      const lastCustomer = [...ticket.comments].reverse().find((c) => c.authorId === null);
      const lastAgent = [...ticket.comments].reverse().find((c) => c.authorId !== null && !c.isInternal);
      const firstName = ticket.requesterName.split(' ')[0] ?? ticket.requesterName;

      const summary = [
        `${ticket.requesterName} reports: ${firstSentence(ticket.description)}`,
        lastAgent ? `Latest from support (${lastAgent.authorName}): ${firstSentence(lastAgent.body)}` : 'No agent has replied yet.',
        lastCustomer ? `Customer follow-up: ${firstSentence(lastCustomer.body)}` : null,
        `Currently ${ticket.status} at ${ticket.priority} priority${ticket.assigneeName ? `, assigned to ${ticket.assigneeName}` : ', unassigned'}.`,
      ]
        .filter(Boolean)
        .join(' ');

      const suggestedReply =
        ticket.status === 'resolved' || ticket.status === 'closed'
          ? `Hi ${firstName}, just checking in to confirm everything is working as expected on your side. If anything comes up again, reply here and we will reopen the ticket.`
          : ticket.priority === 'urgent' || ticket.priority === 'high'
            ? `Hi ${firstName}, thanks for your patience. I have escalated this to our engineering team as a priority and will update you within the next 2 hours with progress.`
            : `Hi ${firstName}, thanks for the details. I am looking into this now and will follow up shortly with next steps.`;

      return aiSummarySchema.parse({ summary, suggestedReply });
    },

    async listMembers() {
      await gate();
      authorize('member:read');
      return db.users.map((user) => memberSchema.parse(toMember(user)));
    },

    async registerPushToken() {
      await gate();
      currentUser();
    },
  };
}
