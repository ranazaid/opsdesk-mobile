import type { Comment, Member, Ticket, TicketPriority, TicketStatus, User } from '../schemas';

export const DEMO_PASSWORD = 'demo1234';

export const DEMO_ORG = { id: 'org_acme', name: 'Acme Logistics' } as const;

export interface MockUser extends User {
  password: string;
}

export const DEMO_USERS: MockUser[] = [
  { id: 'usr_owner', name: 'Sara Malik', email: 'owner@opsdesk.demo', role: 'owner' },
  { id: 'usr_admin', name: 'Daniyal Ahmed', email: 'admin@opsdesk.demo', role: 'admin' },
  { id: 'usr_agent', name: 'Ayesha Khan', email: 'agent@opsdesk.demo', role: 'agent' },
  { id: 'usr_agent2', name: 'Bilal Hussain', email: 'bilal@opsdesk.demo', role: 'agent' },
  { id: 'usr_viewer', name: 'Hamza Iqbal', email: 'viewer@opsdesk.demo', role: 'viewer' },
].map((user) => ({
  ...(user as Omit<User, 'orgId' | 'orgName'>),
  orgId: DEMO_ORG.id,
  orgName: DEMO_ORG.name,
  password: DEMO_PASSWORD,
}));

export function toMember(user: MockUser): Member {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

interface TicketTemplate {
  subject: string;
  description: string;
  tags: string[];
  customerFollowUp: string;
  agentReply: string;
}

const TEMPLATES: TicketTemplate[] = [
  {
    subject: 'Invoices not syncing to QuickBooks',
    description:
      'Since yesterday none of our new invoices are showing up in QuickBooks. The integration page says "connected" but the last sync was 26 hours ago.',
    tags: ['integrations', 'billing'],
    customerFollowUp: 'Still nothing synced this morning. Our month-end close is on Friday.',
    agentReply: 'Thanks for flagging. I can see the sync worker is retrying on a rate-limit error from QuickBooks; I am re-authorising the connection now.',
  },
  {
    subject: 'Driver app crashes when scanning barcodes',
    description:
      'Three of our drivers on Android 14 report the app closes as soon as they open the barcode scanner. Started after the latest update.',
    tags: ['mobile', 'bug'],
    customerFollowUp: 'Attaching device models: Samsung A54, Pixel 7a, Redmi Note 12.',
    agentReply: 'We reproduced this on a Pixel 7a. A fix is in review; in the meantime manual entry of the tracking number works.',
  },
  {
    subject: 'Request to add 15 more seats',
    description: 'We are onboarding a new warehouse team next week and need 15 additional agent seats on our plan.',
    tags: ['billing', 'account'],
    customerFollowUp: 'Can the new seats be prorated for the current cycle?',
    agentReply: 'Yes, seats are prorated automatically. I have sent a quote to your billing contact.',
  },
  {
    subject: 'Webhook deliveries failing with 502',
    description:
      'Our order-updated webhook endpoint is getting 502s from your side according to the delivery log. Our endpoint responds within 200 ms.',
    tags: ['api', 'webhooks'],
    customerFollowUp: 'We have 340 failed deliveries queued. Can they be replayed?',
    agentReply: 'The 502s came from a misconfigured egress proxy on our side, now fixed. I have triggered a replay of all failed deliveries.',
  },
  {
    subject: 'SSO login loops back to sign-in page',
    description: 'After enabling Okta SSO, users are redirected back to the login screen after authenticating. Password login still works.',
    tags: ['sso', 'auth'],
    customerFollowUp: 'Our Okta admin confirmed the ACS URL matches the one in your docs.',
    agentReply: 'The SAML assertion is missing the email attribute. Please map user.email to "email" in the Okta app profile.',
  },
  {
    subject: 'Export of last quarter tickets is empty',
    description: 'CSV export for Q2 downloads but the file only has the header row. Filters: all statuses, all agents.',
    tags: ['reporting'],
    customerFollowUp: 'Same result in Chrome and Safari.',
    agentReply: 'The export job timed out because of the date range size. I have run it manually and emailed you the file.',
  },
  {
    subject: 'Customer portal shows wrong timezone',
    description: 'Ticket timestamps on the customer portal are shown in UTC instead of the customer local time (PKT).',
    tags: ['portal', 'bug'],
    customerFollowUp: 'This is confusing our customers about SLA times.',
    agentReply: 'Confirmed bug; the portal ignored the org timezone setting. Fix ships in tomorrow\'s release.',
  },
  {
    subject: 'How do I set up auto-assignment rules?',
    description: 'We want urgent tickets from enterprise customers to go straight to our tier-2 team. Is that possible?',
    tags: ['how-to', 'automation'],
    customerFollowUp: 'Ideally round-robin within the tier-2 team.',
    agentReply: 'Yes: Settings > Automations > New rule. Condition "priority is urgent" and "customer tier is enterprise", action "assign round-robin to Tier 2".',
  },
  {
    subject: 'Duplicate charges on September invoice',
    description: 'We were charged twice for the September subscription. Both charges show on our corporate card.',
    tags: ['billing', 'refund'],
    customerFollowUp: 'Please refund the duplicate as soon as possible.',
    agentReply: 'I can see the duplicate charge from a retried payment. The refund has been issued and should appear in 5-7 business days.',
  },
  {
    subject: 'API rate limit too low for nightly import',
    description: 'Our nightly import of ~40k shipments hits the 600 req/min rate limit and takes 3 hours. Can the limit be raised?',
    tags: ['api'],
    customerFollowUp: 'We are on the Business plan if that matters.',
    agentReply: 'Business plans can use the bulk endpoint (POST /shipments/bulk, 500 per request). That should bring the import under 10 minutes.',
  },
  {
    subject: 'Email notifications going to spam',
    description: 'Customers say ticket reply emails land in spam in Outlook. We use a custom sending domain.',
    tags: ['email', 'deliverability'],
    customerFollowUp: 'DKIM shows as configured in the dashboard.',
    agentReply: 'Your SPF record is missing our include. Add "include:mail.opsdesk.app" to the TXT record and deliverability should recover within 24h.',
  },
  {
    subject: 'Cannot upload attachments larger than 5 MB',
    description: 'Agents cannot attach PDFs over 5 MB to replies. The upload spinner runs forever.',
    tags: ['attachments', 'bug'],
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

const STATUSES: TicketStatus[] = ['open', 'open', 'pending', 'open', 'resolved', 'pending'];
const PRIORITIES: TicketPriority[] = ['high', 'medium', 'low', 'urgent', 'medium', 'high', 'low'];
const ASSIGNEES = [DEMO_USERS[2], DEMO_USERS[3], DEMO_USERS[1], null] as const;

export interface MockDb {
  users: MockUser[];
  tickets: Ticket[];
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
  const tickets: Ticket[] = [];
  const comments: Comment[] = [];

  for (let i = 0; i < ticketCount; i += 1) {
    const template = TEMPLATES[i % TEMPLATES.length]!;
    const requester = REQUESTERS[i % REQUESTERS.length]!;
    const assignee = ASSIGNEES[i % ASSIGNEES.length] ?? null;
    const createdAt = new Date(now.getTime() - (i * 5 + 3) * HOUR);
    const id = `tkt_${(1000 + i).toString(36)}`;
    const ticketComments: Comment[] = [
      {
        id: `cmt_${id}_1`,
        ticketId: id,
        body: template.agentReply,
        author: assignee ? { id: assignee.id, name: assignee.name, kind: 'agent' } : { id: 'usr_admin', name: 'Daniyal Ahmed', kind: 'agent' },
        createdAt: new Date(createdAt.getTime() + 1 * HOUR).toISOString(),
      },
    ];
    if (i % 3 !== 2) {
      ticketComments.push({
        id: `cmt_${id}_2`,
        ticketId: id,
        body: template.customerFollowUp,
        author: { id: `cust_${i % REQUESTERS.length}`, name: requester.name, kind: 'customer' },
        createdAt: new Date(createdAt.getTime() + 2 * HOUR).toISOString(),
      });
    }
    const updatedAt = ticketComments[ticketComments.length - 1]!.createdAt;
    comments.push(...ticketComments);
    tickets.push({
      id,
      number: 1001 + i,
      subject: i < TEMPLATES.length ? template.subject : `${template.subject} (${requester.name.split(' ')[1]})`,
      description: template.description,
      status: STATUSES[i % STATUSES.length]!,
      priority: PRIORITIES[i % PRIORITIES.length]!,
      requester,
      assignee: assignee ? { id: assignee.id, name: assignee.name } : null,
      tags: template.tags,
      commentCount: ticketComments.length,
      createdAt: createdAt.toISOString(),
      updatedAt,
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
