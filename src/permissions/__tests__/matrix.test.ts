import { ROLES } from '@/api/schemas';

import { can, canApplyPatch, canEdit, isAssignable, MOBILE_PERMISSIONS, PERMISSION_MATRIX, PERMISSIONS, permissionsFor } from '../matrix';

/**
 * Pins the mobile copy of the matrix to opsdesk-web's `src/lib/permissions.ts`
 * (and its `tests/rbac.test.ts`). The expected lists are spelled out so any
 * change to who-can-do-what must be made deliberately in both repos.
 */
describe('permission matrix (mirrors opsdesk-web)', () => {
  it('defines every role', () => {
    expect(Object.keys(PERMISSION_MATRIX).sort()).toEqual([...ROLES].sort());
  });

  it('gives owners every permission', () => {
    expect(permissionsFor('owner')).toEqual([...PERMISSIONS]);
  });

  it('matches the documented matrix', () => {
    expect(permissionsFor('admin')).toEqual([
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
    ]);
    expect(permissionsFor('agent')).toEqual([
      'ticket:read',
      'ticket:create',
      'ticket:update',
      'ticket:assign',
      'comment:create',
      'comment:internal',
      'ai:use',
      'audit:read',
      'member:read',
    ]);
    expect(permissionsFor('viewer')).toEqual(['ticket:read', 'audit:read', 'member:read']);
  });

  it('is strictly hierarchical: each role has a superset of the role below', () => {
    const order = ['viewer', 'agent', 'admin', 'owner'] as const;
    for (let i = 1; i < order.length; i += 1) {
      const lower = permissionsFor(order[i - 1]!);
      const higher = permissionsFor(order[i]!);
      expect(higher).toEqual(expect.arrayContaining(lower));
      expect(higher.length).toBeGreaterThan(lower.length);
    }
  });

  it('denies writes and AI to viewers', () => {
    for (const permission of ['ticket:create', 'ticket:update', 'ticket:assign', 'comment:create', 'ai:use'] as const) {
      expect(can('viewer', permission)).toBe(false);
    }
    expect(canEdit('viewer')).toBe(false);
    expect(canEdit('agent')).toBe(true);
  });

  it('denies everything when there is no role (signed out)', () => {
    expect(can(null, 'ticket:read')).toBe(false);
    expect(can(undefined, 'comment:create')).toBe(false);
  });

  it('only shows labels for real permissions', () => {
    expect(MOBILE_PERMISSIONS.every(({ permission }) => (PERMISSIONS as readonly string[]).includes(permission))).toBe(true);
  });

  it('only lets non-viewers be assigned tickets', () => {
    expect(ROLES.filter(isAssignable)).toEqual(['owner', 'admin', 'agent']);
  });
});

describe('canApplyPatch (mirrors PATCH /tickets/:id guards)', () => {
  it('lets agents change status and priority and (re)assign', () => {
    expect(canApplyPatch('agent', { status: 'resolved' })).toBe(true);
    expect(canApplyPatch('agent', { priority: 'urgent' })).toBe(true);
    expect(canApplyPatch('agent', { assigneeId: 'u2' })).toBe(true);
    expect(canApplyPatch('agent', { assigneeId: null })).toBe(true);
  });

  it('rejects viewers and empty patches', () => {
    expect(canApplyPatch('viewer', { status: 'resolved' })).toBe(false);
    expect(canApplyPatch('viewer', { assigneeId: 'u2' })).toBe(false);
    expect(canApplyPatch('owner', {})).toBe(false);
  });
});
