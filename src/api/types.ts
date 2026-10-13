import type {
  AiSummary,
  Comment,
  CreateTicketInput,
  LoginResponse,
  Member,
  Ticket,
  TicketDetail,
  TicketListParams,
  TicketPage,
  UpdateTicketInput,
  User,
} from './schemas';

export interface PushTokenRegistration {
  token: string;
  platform: 'ios' | 'android' | 'web';
}

/**
 * The OpsDesk API surface used by the app. Implemented by the HTTP client
 * (`httpApi.ts`) and by the in-memory demo backend (`mock/mockApi.ts`), so the
 * rest of the app cannot tell which one it is talking to.
 */
export interface OpsDeskApi {
  login(email: string, password: string): Promise<LoginResponse>;
  me(): Promise<User>;
  listTickets(params: TicketListParams, signal?: AbortSignal): Promise<TicketPage>;
  getTicket(id: string, signal?: AbortSignal): Promise<TicketDetail>;
  createTicket(input: CreateTicketInput): Promise<Ticket>;
  updateTicket(id: string, patch: UpdateTicketInput): Promise<Ticket>;
  addComment(ticketId: string, body: string, clientId: string): Promise<Comment>;
  summarizeTicket(ticketId: string): Promise<AiSummary>;
  listMembers(): Promise<Member[]>;
  registerPushToken(registration: PushTokenRegistration): Promise<void>;
}
