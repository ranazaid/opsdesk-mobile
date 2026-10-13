import { z } from 'zod';

/**
 * Response contracts for the OpsDesk REST API (`/api/v1`).
 *
 * Every response is parsed with these schemas before it reaches the UI, so a
 * backend change that breaks the contract fails loudly as an `ApiError` of kind
 * `validation` instead of rendering `undefined` somewhere deep in a screen.
 * Types are inferred from the schemas: the schema is the single source of truth.
 */

export const ROLES = ['owner', 'admin', 'agent', 'viewer'] as const;
export const TICKET_STATUSES = ['open', 'pending', 'resolved'] as const;
export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export const roleSchema = z.enum(ROLES);
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);

const isoDate = z.iso.datetime({ offset: true });

export const userSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.email(),
  role: roleSchema,
  orgId: z.string().min(1),
  orgName: z.string(),
});

export const memberSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.email(),
  role: roleSchema,
});

export const userSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
});

export const loginResponseSchema = z.object({
  token: z.string().min(1),
  user: userSchema,
});

export const ticketSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().positive(),
  subject: z.string(),
  description: z.string(),
  status: ticketStatusSchema,
  priority: ticketPrioritySchema,
  requester: z.object({ name: z.string(), email: z.email() }),
  assignee: userSummarySchema.nullable(),
  tags: z.array(z.string()).default([]),
  commentCount: z.number().int().nonnegative(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const commentSchema = z.object({
  id: z.string().min(1),
  ticketId: z.string().min(1),
  body: z.string(),
  author: z.object({
    id: z.string().min(1),
    name: z.string(),
    kind: z.enum(['agent', 'customer']),
  }),
  createdAt: isoDate,
});

export const ticketDetailSchema = ticketSchema.extend({
  comments: z.array(commentSchema),
});

export const ticketPageSchema = z.object({
  items: z.array(ticketSchema),
  nextCursor: z.string().nullable(),
});

export const membersResponseSchema = z.object({
  items: z.array(memberSchema),
});

export const aiSummarySchema = z.object({
  summary: z.string(),
  suggestedReply: z.string(),
});

export const pushRegistrationSchema = z.object({
  ok: z.literal(true),
});

export type Role = z.infer<typeof roleSchema>;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
export type User = z.infer<typeof userSchema>;
export type Member = z.infer<typeof memberSchema>;
export type UserSummary = z.infer<typeof userSummarySchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type Ticket = z.infer<typeof ticketSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type TicketDetail = z.infer<typeof ticketDetailSchema>;
export type TicketPage = z.infer<typeof ticketPageSchema>;
export type AiSummary = z.infer<typeof aiSummarySchema>;

/** Request payloads. Validated client-side before sending. */
export const createTicketInputSchema = z.object({
  subject: z.string().trim().min(4, 'Subject must be at least 4 characters').max(140),
  description: z.string().trim().min(10, 'Describe the issue in at least 10 characters').max(5000),
  priority: ticketPrioritySchema,
  requesterEmail: z.email('Enter a valid email'),
});

export const updateTicketInputSchema = z
  .object({
    status: ticketStatusSchema.optional(),
    priority: ticketPrioritySchema.optional(),
    assigneeId: z.string().min(1).nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, 'Patch must change at least one field');

export type CreateTicketInput = z.infer<typeof createTicketInputSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketInputSchema>;

export interface TicketListParams {
  status?: TicketStatus;
  q?: string;
  cursor?: string | null;
}
