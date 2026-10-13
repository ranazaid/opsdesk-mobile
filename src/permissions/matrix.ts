import type { Role, UpdateTicketInput } from '@/api/schemas';

/**
 * Role-based permission matrix for the mobile client.
 *
 * Intentionally dependency-free and data-driven so it can be shared with (or
 * generated from) the backend's matrix. The server is the security boundary;
 * the client uses this only to decide what to *show*. The demo mock API
 * enforces it too, so demo mode behaves like production.
 */
export const PERMISSIONS = {
  'ticket.view': ['owner', 'admin', 'agent', 'viewer'],
  'ticket.create': ['owner', 'admin', 'agent'],
  'ticket.reply': ['owner', 'admin', 'agent'],
  'ticket.changeStatus': ['owner', 'admin', 'agent'],
  'ticket.changePriority': ['owner', 'admin', 'agent'],
  'ticket.reassign': ['owner', 'admin'],
  'ai.summarize': ['owner', 'admin', 'agent'],
  'members.view': ['owner', 'admin', 'agent', 'viewer'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_LABELS: Record<Permission, string> = {
  'ticket.view': 'View tickets and conversations',
  'ticket.create': 'Create tickets',
  'ticket.reply': 'Reply to customers',
  'ticket.changeStatus': 'Change ticket status',
  'ticket.changePriority': 'Change ticket priority',
  'ticket.reassign': 'Reassign tickets to teammates',
  'ai.summarize': 'Generate AI summaries',
  'members.view': 'See team members',
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  agent: 'Agent',
  viewer: 'Viewer',
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((permission) => can(role, permission));
}

/** True when the role can change anything at all (viewers are read-only). */
export function canEdit(role: Role | null | undefined): boolean {
  return can(role, 'ticket.reply') || can(role, 'ticket.changeStatus');
}

/** Maps a PATCH /tickets/:id body to the permissions it requires. */
export function requiredPermissionsForPatch(patch: UpdateTicketInput): Permission[] {
  const required: Permission[] = [];
  if (patch.status !== undefined) required.push('ticket.changeStatus');
  if (patch.priority !== undefined) required.push('ticket.changePriority');
  if (patch.assigneeId !== undefined) required.push('ticket.reassign');
  return required;
}

export function canApplyPatch(role: Role | null | undefined, patch: UpdateTicketInput): boolean {
  const required = requiredPermissionsForPatch(patch);
  return required.length > 0 && required.every((permission) => can(role, permission));
}
