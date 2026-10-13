import type { Role, UpdateTicketInput } from '@/api/schemas';

/**
 * RBAC permission matrix, mirrored from opsdesk-web's single source of truth
 * (`src/lib/permissions.ts`). The server enforces it on every request; the app
 * reads it only to decide which controls to show. `GET /me` also returns the
 * caller's permissions, and the test suite pins this copy to the same table.
 */
export const PERMISSIONS = [
  'ticket:read',
  'ticket:create',
  'ticket:update',
  'ticket:assign',
  'comment:create',
  'comment:internal',
  'ai:use',
  'audit:read',
  'member:read',
  'member:invite',
  'member:update_role',
  'member:remove',
  'billing:read',
  'billing:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const VIEWER: readonly Permission[] = ['ticket:read', 'audit:read', 'member:read'];

const AGENT: readonly Permission[] = [
  ...VIEWER,
  'ticket:create',
  'ticket:update',
  'ticket:assign',
  'comment:create',
  'comment:internal',
  'ai:use',
];

const ADMIN: readonly Permission[] = [...AGENT, 'member:invite', 'member:update_role', 'member:remove', 'billing:read'];

export const PERMISSION_MATRIX: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  owner: new Set(PERMISSIONS),
  admin: new Set(ADMIN),
  agent: new Set(AGENT),
  viewer: new Set(VIEWER),
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return PERMISSION_MATRIX[role].has(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return PERMISSIONS.filter((permission) => can(role, permission));
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  agent: 'Agent',
  viewer: 'Viewer',
};

/** The permissions that change what the mobile app shows, with user-facing labels. */
export const MOBILE_PERMISSIONS: readonly { permission: Permission; label: string }[] = [
  { permission: 'ticket:read', label: 'View tickets and conversations' },
  { permission: 'ticket:create', label: 'Create tickets' },
  { permission: 'comment:create', label: 'Reply to customers' },
  { permission: 'ticket:update', label: 'Change status and priority' },
  { permission: 'ticket:assign', label: 'Assign tickets' },
  { permission: 'ai:use', label: 'Use AI summaries and drafts' },
  { permission: 'member:read', label: 'See team members' },
];

/** True when the role can change anything at all (viewers are read-only). */
export function canEdit(role: Role | null | undefined): boolean {
  return can(role, 'ticket:update') || can(role, 'comment:create');
}

/** Roles that can be assigned tickets (the server rejects assigning to viewers). */
export function isAssignable(role: Role): boolean {
  return can(role, 'ticket:update');
}

/** Mirrors the server's checks for PATCH /tickets/:id. */
export function requiredPermissionsForPatch(patch: UpdateTicketInput): Permission[] {
  const required: Permission[] = ['ticket:update'];
  if (patch.assigneeId !== undefined) required.push('ticket:assign');
  return required;
}

export function canApplyPatch(role: Role | null | undefined, patch: UpdateTicketInput): boolean {
  const hasChange = Object.values(patch).some((value) => value !== undefined);
  return hasChange && requiredPermissionsForPatch(patch).every((permission) => can(role, permission));
}
