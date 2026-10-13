import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { Comment, Ticket, TicketDetail, TicketPage } from '@/api/schemas';

import { ticketKeys } from './queryKeys';

/** Write a server-confirmed ticket into the detail cache and every cached list page. */
export function writeTicketToCache(queryClient: QueryClient, ticket: Ticket): void {
  queryClient.setQueryData<TicketDetail>(ticketKeys.detail(ticket.id), (detail) => (detail ? { ...detail, ...ticket } : detail));
  queryClient.setQueriesData<InfiniteData<TicketPage>>({ queryKey: ticketKeys.lists() }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({ ...page, items: page.items.map((item) => (item.id === ticket.id ? { ...item, ...ticket } : item)) })),
        }
      : data,
  );
}

/** Append a server-confirmed comment to the cached ticket detail (idempotent). */
export function writeCommentToCache(queryClient: QueryClient, comment: Comment): void {
  queryClient.setQueryData<TicketDetail>(ticketKeys.detail(comment.ticketId), (detail) =>
    detail && !detail.comments.some((existing) => existing.id === comment.id)
      ? { ...detail, comments: [...detail.comments, comment], updatedAt: comment.createdAt }
      : detail,
  );
}
