import { ROLES, type Role } from '@/api/schemas';

import { can, canApplyPatch, canEdit, PERMISSION_LABELS, PERMISSIONS, permissionsFor, type Permission } from '../matrix';

/**
 * The expected matrix is spelled out explicitly (not derived from PERMISSIONS)
 * so any change to who-can-do-what has to be made deliberately in two places.
 */
const EXPECTED: Record<Permission, Record<Role, boolean>> = {
  'ticket.view': { owner: true, admin: true, agent: true, viewer: true },
  'ticket.create': { owner: true, admin: true, agent: true, viewer: false },
  'ticket.reply': { owner: true, admin: true, agent: true, viewer: false },
  'ticket.changeStatus': { owner: true, admin: true, agent: true, viewer: false },
  'ticket.changePriority': { owner: true, admin: true, agent: true, viewer: false },
  'ticket.reassign': { owner: true, admin: true, agent: false, viewer: false },
  'ai.summarize': { owner: true, admin: true, agent: true, viewer: false },
  'members.view': { owner: true, admin: true, agent: true, viewer: true },
};

describe('permission matrix', () => {
  const cases = (Object.keys(EXPECTED) as Permission[]).flatMap((permission) =>
    ROLES.map((role) => [permission, role, EXPECTED[permission][role]] as const),
  );

  it.each(cases)('%s for %s -> %s', (permission, role, allowed) => {
    expect(can(role, permission)).toBe(allowed);
  });

  it('covers every permission with a label and an expectation', () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(Object.keys(PERMISSION_LABELS).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it('denies everything when there is no role (signed out)', () => {
    expect(can(null, 'ticket.view')).toBe(false);
    expect(can(undefined, 'ticket.reply')).toBe(false);
  });

  it('viewers are read-only; agents and above can edit', () => {
    expect(canEdit('viewer')).toBe(false);
    expect(canEdit('agent')).toBe(true);
    expect(canEdit('admin')).toBe(true);
    expect(permissionsFor('viewer')).toEqual(['ticket.view', 'members.view']);
  });

  it('privileges are monotonic: owner >= admin >= agent >= viewer', () => {
    const order: Role[] = ['viewer', 'agent', 'admin', 'owner'];
    for (let i = 1; i < order.length; i += 1) {
      const lower = new Set(permissionsFor(order[i - 1]!));
      const higher = new Set(permissionsFor(order[i]!));
      lower.forEach((permission) => expect(higher.has(permission)).toBe(true));
    }
  });

  describe('canApplyPatch', () => {
    it('lets agents change status and priority but not reassign', () => {
      expect(canApplyPatch('agent', { status: 'resolved' })).toBe(true);
      expect(canApplyPatch('agent', { priority: 'urgent' })).toBe(true);
      expect(canApplyPatch('agent', { assigneeId: 'usr_2' })).toBe(false);
      expect(canApplyPatch('agent', { status: 'pending', assigneeId: null })).toBe(false);
    });

    it('lets admins and owners reassign or unassign', () => {
      expect(canApplyPatch('admin', { assigneeId: 'usr_2' })).toBe(true);
      expect(canApplyPatch('owner', { assigneeId: null })).toBe(true);
    });

    it('rejects viewers and empty patches', () => {
      expect(canApplyPatch('viewer', { status: 'resolved' })).toBe(false);
      expect(canApplyPatch('owner', {})).toBe(false);
    });
  });
});
