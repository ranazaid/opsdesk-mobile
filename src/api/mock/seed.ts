import type { Comment, Member, Ticket, TicketPriority, TicketStatus, User } from '../schemas';

/**
 * Demo data for the in-memory backend. Accounts, organization and password
 * match opsdesk-web's seed (`npm run db:seed`), so the same credentials work in
 * demo mode and against a locally running opsdesk-web.
 */
export const DEMO_PASSWORD = 'opsdesk-demo';

export const DEMO_ORG = { id: 'org_northwind', name: 'Northwind Agency', plan: 'pro' } as const;

export interface MockUser extends User {
  password: string;
  joinedAt: string;
}

const SEED_EPOCH = '2026-01-05T09:00:00.000Z';

export const DEMO_USERS: MockUser[] = [
  { id: 'usr_owner', name: 'Olivia Bennett', email: 'olivia@northwind.test', role: 'owner' },
  { id: 'usr_admin', name: 'Adam Clarke', email: 'adam@northwind.test', role: 'admin' },
  { id: 'usr_agent', name: 'Aisha Khan', email: 'aisha@northwind.test', role: 'agent' },
  { id: 'usr_agent2', name: 'Marco Rossi', email: 'marco@northwind.test', role: 'agent' },
  { id: 'usr_viewer', name: 'Victor Hughes', email: 'victor@northwind.test', role: 'viewer' },
].map((user) => ({
  ...(user as Pick<User, 'id' | 'name' | 'email' | 'role'>),
  orgId: DEMO_ORG.id,
  orgName: DEMO_ORG.name,
  plan: DEMO_ORG.plan,
  password: DEMO_PASSWORD,
  joinedAt: SEED_EPOCH,
}));

export function toMember(user: MockUser): Member {
  return { userId: user.id, name: user.name, email: user.email, role: user.role, joinedAt: user.joinedAt };
}

export function toPublicUser({ password: _password, joinedAt: _joinedAt, ...user }: MockUser): User {
  return user;
}

interface TicketTemplate {
  subject: string;
  description: string;
  customerFollowUp: string;
  agentReply: string;
}

const TEMPLATES: TicketTemplate[] = [
  {
    subject: 'Invoices not syncing to QuickBooks',
    description:
      'Since yesterday none of our new invoices are showing up in QuickBooks. The integration page says "connected" but the last sync was 26 hours ago.',
    customerFollowUp: 'Still nothing synced this morning. Our month-end close is on Friday.',
    agentReply: 'Thanks for flagging. I can see the sync worker is retrying on a rate-limit error from QuickBooks; I am re-authorising the connection now.',
  },
  {
    subject: 'Driver app crashes when scanning barcodes',
    description:
      'Three of our drivers on Android 14 report the app closes as soon as they open the barcode scanner. Started after the latest update.',
    customerFollowUp: 'Attaching device models: Samsung A54, Pixel 7a, Redmi Note 12.',
    agentReply: 'We reproduced this on a Pixel 7a. A fix is in review; in the meantime manual entry of the tracking number works.',
  },
  {
    subject: 'Request to add 15 more seats',
    description: 'We are onboarding a new warehouse team next week and need 15 additional agent seats on our plan.',
    customerFollowUp: 'Can the new seats be prorated for the current cycle?',
    agentReply: 'Yes, seats are prorated automatically. I have sent a quote to your billing contact.',
  },
  {
    subject: 'Webhook deliveries failing with 502',
    description:
      'Our order-updated webhook endpoint is getting 502s from your side according to the delivery log. Our endpoint responds within 200 ms.',
    customerFollowUp: 'We have 340 failed deliveries queued. Can they be replayed?',
    agentReply: 'The 502s came from a misconfigured egress proxy on our side, now fixed. I have triggered a replay of all failed deliveries.',
  },
  {
    subject: 'SSO login loops back to sign-in page',
    description: 'After enabling Okta SSO, users are redirected back to the login screen after authenticating. Password login still works.',
    customerFollowUp: 'Our Okta admin confirmed the ACS URL matches the one in your docs.',
    agentReply: 'The SAML assertion is missing the email attribute. Please map user.email to "email" in the Okta app profile.',
  },
  {
    subject: 'Export of last quarter tickets is empty',
    description: 'CSV export for Q2 downloads but the file only has the header row. Filters: all statuses, all agents.',
    customerFollowUp: 'Same result in Chrome and Safari.',
    agentReply: 'The export job timed out because of the date range size. I have run it manually and emailed you the file.',
  },
  {
    subject: 'Customer portal shows wrong timezone',
    description: 'Ticket timestamps on the customer portal are shown in UTC instead of the customer local time (PKT).',
    customerFollowUp: 'This is confusing our customers about SLA times.',
    agentReply: 'Confirmed bug; the portal ignored the org timezone setting. Fix ships in tomorrow\'s release.',
  },
  {
    subject: 'How do I set up auto-assignment rules?',
    description: 'We want urgent tickets from enterprise customers to go straight to our tier-2 team. Is that possible?',
    customerFollowUp: 'Ideally round-robin within the tier-2 team.',
    agentReply: 'Yes: Settings > Automations > New rule. Condition "priority is urgent" and "customer tier is enterprise", action "assign round-robin to Tier 2".',
  },
  {
    subject: 'Duplicate charges on September invoice',
    description: 'We were charged twice for the September subscription. Both charges show on our corporate card.',
    customerFollowUp: 'Please refund the duplicate as soon as possible.',
    agentReply: 'I can see the duplicate charge from a retried payment. The refund has been issued and should appear in 5-7 business days.',
  },
  {
    subject: 'API rate limit too low for nightly import',
    description: 'Our nightly import of ~40k shipments hits the 600 req/min rate limit and takes 3 hours. Can the limit be raised?',
    customerFollowUp: 'We are on the Business plan if that matters.',
    agentReply: 'Business plans can use the bulk endpoint (POST /shipments/bulk, 500 per request). That should bring the import under 10 minutes.',
  },
  {
    subject: 'Email notifications going to spam',
    description: 'Customers say ticket reply emails land in spam in Outlook. We use a custom sending domain.',
    customerFollowUp: 'DKIM shows as configured in the dashboard.',
    agentReply: 'Your SPF record is missing our include. Add "include:mail.opsdesk.app" to the TXT record and deliverability should recover within 24h.',
  },
  {
    subject: 'Cannot upload attachments larger than 5 MB',
    description: 'Agents cannot attach PDFs over 5 MB to replies. The upload spinner runs forever.',
    customerFollowUp: 'Our shipping manifests are often 8-12 MB.',
    agentReply: 'The limit is 25 MB; the hang was a client timeout on slow connections. We have raised it and added resumable uploads.',
  },
];

const REQUESTERS = [
  { name: 'Imran Siddiqui', email: 'imran@northwind.example' },
  { name: 'Mehwish Raza', email: 'mehwish@contoso.example' },
  { name: 'Usman Tariq', email: 'usman@fabrikam.example' },
  { name: 'Hina Javed', email: 'hina@tailspin.example' },
  { name: 'Omar Farooq', email: 'omar@wingtip.example' },
  { name: 'Zainab Ali', email: 'zainab@litware.example' },
];

const STATUSES: TicketStatus[] = ['open', 'open', 'pending', 'open', 'resolved', 'pending', 'closed'];
const PRIORITIES: TicketPriority[] = ['high', 'normal', 'low', 'urgent', 'normal', 'high', 'low'];
const ASSIGNEES = [DEMO_USERS[2], DEMO_USERS[3], DEMO_USERS[1], null] as const;

export type MockTicket = Ticket & { description: string };

export interface MockDb {
  users: MockUser[];
  tickets: MockTicket[];
  comments: Comment[];
  nextTicketNumber: number;
  nextId: number;
}

const HOUR = 60 * 60 * 1000;

/**
 * Deterministic seed: 36 tickets across all statuses and priorities, each with
 * a short conversation, timestamped relative to `now` so the demo looks fresh.
 */
export function createSeed(now: Date = new Date(), ticketCount = 36): MockDb {
  const tickets: MockTicket[] = [];
  const comments: Comment[] = [];

  for (let i = 0; i < ticketCount; i += 1) {
    const template = TEMPLATES[i % TEMPLATES.length]!;
    const requester = REQUESTERS[i % REQUESTERS.length]!;
    const assignee = ASSIGNEES[i % ASSIGNEES.length] ?? null;
    const responder = assignee ?? DEMO_USERS[1]!;
    const createdAt = new Date(now.getTime() - (i * 5 + 3) * HOUR);
    const at = (hours: number) => new Date(createdAt.getTime() + hours * HOUR).toISOString();
    const id = `tkt_${(1000 + i).toString(36)}`;
    const thread: Comment[] = [
      { id: `cmt_${id}_1`, ticketId: id, authorId: responder.id, authorName: responder.name, body: template.agentReply, isInternal: false, createdAt: at(1) },
    ];
    if (i % 3 !== 2) {
      thread.push({
        id: `cmt_${id}_2`,
        ticketId: id,
        authorId: null,
        authorName: requester.name,
        body: template.customerFollowUp,
        isInternal: false,
        createdAt: at(2),
      });
    }
    if (i % 4 === 1) {
      thread.push({
        id: `cmt_${id}_3`,
        ticketId: id,
        authorId: DEMO_USERS[1]!.id,
        authorName: DEMO_USERS[1]!.name,
        body: 'Internal: keep an eye on this account, they are up for renewal next month.',
        isInternal: true,
        createdAt: at(2.5),
      });
    }
    comments.push(...thread);
    const status = STATUSES[i % STATUSES.length]!;
    const updatedAt = thread[thread.length - 1]!.createdAt;
    tickets.push({
      id,
      number: 1001 + i,
      subject: i < TEMPLATES.length ? template.subject : `${template.subject} (${requester.name.split(' ')[1]})`,
      description: template.description,
      status,
      priority: PRIORITIES[i % PRIORITIES.length]!,
      requesterName: requester.name,
      requesterEmail: requester.email,
      assigneeId: assignee?.id ?? null,
      assigneeName: assignee?.name ?? null,
      createdAt: createdAt.toISOString(),
      updatedAt,
      resolvedAt: status === 'resolved' || status === 'closed' ? updatedAt : null,
    });
  }

  return {
    users: DEMO_USERS.map((user) => ({ ...user })),
    tickets,
    comments,
    nextTicketNumber: 1001 + ticketCount,
    nextId: 1,
  };
}
