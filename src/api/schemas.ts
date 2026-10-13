import { z } from 'zod';

/**
 * Contracts for the OpsDesk REST API (`/api/v1`, served by opsdesk-web).
 *
 * Two layers live here:
 * - **Wire schemas** (`*ResponseSchema`, `*EnvelopeSchema`) describe exactly what
 *   opsdesk-web returns: `{ accessToken, user, organization }` on login,
 *   `{ ticket }` / `{ comment }` envelopes, page-based lists, `{ task, text }`
 *   from the AI endpoint. Only `httpApi.ts` uses them.
 * - **Domain schemas** (`userSchema`, `ticketSchema`, ...) are what the rest of
 *   the app consumes. The mock API produces them directly.
 *
 * Every response is parsed before it reaches the UI, so a contract change fails
 * loudly as an `ApiError` of kind `validation` instead of rendering `undefined`.
 * The enums mirror `opsdesk-web/src/lib/domain.ts`.
 */

export const ROLES = ['owner', 'admin', 'agent', 'viewer'] as const;
export const TICKET_STATUSES = ['open', 'pending', 'resolved', 'closed'] as const;
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const PLANS = ['free', 'pro', 'business'] as const;
export const AI_TASKS = ['summary', 'reply'] as const;
export const PUSH_PLATFORMS = ['ios', 'android'] as const;

export const roleSchema = z.enum(ROLES);
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);
export const planSchema = z.enum(PLANS);

const timestamp = z.iso.datetime({ offset: true });

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

/** The signed-in user acting inside one organization. */
export const userSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.email(),
  role: roleSchema,
  orgId: z.string().min(1),
  orgName: z.string(),
  plan: planSchema,
});

export const ticketSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().positive(),
  subject: z.string(),
  status: ticketStatusSchema,
  priority: ticketPrioritySchema,
  requesterName: z.string(),
  requesterEmail: z.string(),
  assigneeId: z.string().nullable(),
  /** Absent on `POST /tickets` responses (the raw row), so default it. */
  assigneeName: z.string().nullable().default(null),
  createdAt: timestamp,
  updatedAt: timestamp,
  resolvedAt: timestamp.nullable().default(null),
});

export const ticketWithDescriptionSchema = ticketSchema.extend({ description: z.string() });

export const commentSchema = z.object({
  id: z.string().min(1),
  ticketId: z.string().min(1),
  /** `null` when the message came from the customer (requester). */
  authorId: z.string().nullable(),
  authorName: z.string(),
  body: z.string(),
  /** Internal notes are visible to the team only. */
  isInternal: z.boolean(),
  createdAt: timestamp,
});

export const ticketDetailSchema = ticketWithDescriptionSchema.extend({ comments: z.array(commentSchema) });

export const ticketPageSchema = z.object({
  items: z.array(ticketSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export const memberSchema = z.object({
  userId: z.string().min(1),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  joinedAt: timestamp,
});

export const aiSummarySchema = z.object({
  summary: z.string(),
  suggestedReply: z.string(),
});

export type Role = z.infer<typeof roleSchema>;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
export type Plan = z.infer<typeof planSchema>;
export type AiTask = (typeof AI_TASKS)[number];
export type User = z.infer<typeof userSchema>;
export type Ticket = z.infer<typeof ticketSchema>;
export type TicketWithDescription = z.infer<typeof ticketWithDescriptionSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type TicketDetail = z.infer<typeof ticketDetailSchema>;
export type TicketPage = z.infer<typeof ticketPageSchema>;
export type Member = z.infer<typeof memberSchema>;
export type AiSummary = z.infer<typeof aiSummarySchema>;

export interface Session {
  token: string;
  user: User;
}

// ---------------------------------------------------------------------------
// Wire (opsdesk-web /api/v1 response bodies)
// ---------------------------------------------------------------------------

const wireUserSchema = z.object({ id: z.string().min(1), email: z.email(), name: z.string() });

/** POST /auth/login */
export const loginResponseSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.string().optional(),
  expiresIn: z.number().optional(),
  user: wireUserSchema,
  organization: z.object({ id: z.string().min(1), name: z.string(), plan: planSchema, role: roleSchema }),
});

/** GET /me */
export const meResponseSchema = z.object({
  user: wireUserSchema,
  organization: z.object({ id: z.string().min(1), name: z.string(), plan: planSchema }),
  role: roleSchema,
  permissions: z.array(z.string()),
});

/** GET /tickets/:id, POST /tickets, PATCH /tickets/:id */
export const ticketEnvelopeSchema = z.object({ ticket: ticketWithDescriptionSchema });
/** GET /tickets/:id/comments */
export const commentsEnvelopeSchema = z.object({ comments: z.array(commentSchema) });
/** POST /tickets/:id/comments */
export const commentEnvelopeSchema = z.object({ comment: commentSchema });
/** POST /ai/summary (non-streaming) */
export const aiResponseSchema = z.object({ task: z.enum(AI_TASKS), text: z.string() });
/** GET /members */
export const membersEnvelopeSchema = z.object({ members: z.array(memberSchema) });
/** POST /devices/push-token */
export const okResponseSchema = z.object({ ok: z.literal(true) });

// ---------------------------------------------------------------------------
// Request payloads (validated client-side with the same rules as the server)
// ---------------------------------------------------------------------------

export const createTicketInputSchema = z.object({
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters').max(200),
  description: z.string().trim().min(1, 'Describe the issue').max(10_000),
  requesterName: z.string().trim().min(1, 'Customer name is required').max(120),
  requesterEmail: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  priority: ticketPrioritySchema,
});

export const updateTicketInputSchema = z
  .object({
    status: ticketStatusSchema.optional(),
    priority: ticketPrioritySchema.optional(),
    /** `null` unassigns the ticket. */
    assigneeId: z.string().min(1).nullable().optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), 'Patch must change at least one field');

export type CreateTicketInput = z.infer<typeof createTicketInputSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketInputSchema>;

export const DEFAULT_PAGE_SIZE = 20;

export interface TicketListParams {
  status?: TicketStatus;
  q?: string;
  page?: number;
  pageSize?: number;
}
