import type { TicketStatus } from '@/api/schemas';

export interface TicketListFilters {
  status: TicketStatus | null;
  q: string;
}

export const ticketKeys = {
  all: ['tickets'] as const,
  lists: () => [...ticketKeys.all, 'list'] as const,
  list: (filters: TicketListFilters) => [...ticketKeys.lists(), filters] as const,
  details: () => [...ticketKeys.all, 'detail'] as const,
  detail: (id: string) => [...ticketKeys.details(), id] as const,
};

export const memberKeys = {
  all: ['members'] as const,
};
