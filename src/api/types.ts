import type {
  AiSummary,
  Comment,
  CreateTicketInput,
  Member,
  Session,
  Ticket,
  TicketDetail,
  TicketListParams,
  TicketPage,
  UpdateTicketInput,
  User,
} from './schemas';

export interface PushTokenRegistration {
  token: string;
  platform: 'ios' | 'android';
}

/**
 * The OpsDesk API surface used by the app, in domain types. Implemented by the
 * HTTP adapter for opsdesk-web (`httpApi.ts`) and by the in-memory demo backend
 * (`mock/mockApi.ts`), so the rest of the app cannot tell which one it is using.
 */
export interface OpsDeskApi {
  login(email: string, password: string): Promise<Session>;
  me(): Promise<User>;
  listTickets(params: TicketListParams, signal?: AbortSignal): Promise<TicketPage>;
  /** Ticket with description and its full thread. */
  getTicket(id: string, signal?: AbortSignal): Promise<TicketDetail>;
  createTicket(input: CreateTicketInput): Promise<Ticket>;
  updateTicket(id: string, patch: UpdateTicketInput): Promise<Ticket>;
  /** `clientId` identifies the optimistic copy in the outbox. */
  addComment(ticketId: string, body: string, clientId: string): Promise<Comment>;
  summarizeTicket(ticketId: string): Promise<AiSummary>;
  listMembers(): Promise<Member[]>;
  registerPushToken(registration: PushTokenRegistration): Promise<void>;
}
