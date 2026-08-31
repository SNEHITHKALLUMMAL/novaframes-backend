import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleSatisfies, canAssignRole } from './roleAuthorization.js';
import { USER_ROLES } from '../constants/enums.js';

test('roleSatisfies: a plain user does not satisfy an admin-only check', () => {
  assert.equal(roleSatisfies(USER_ROLES.USER, [USER_ROLES.ADMIN]), false);
});

test('roleSatisfies: an admin satisfies an admin-only check', () => {
  assert.equal(roleSatisfies(USER_ROLES.ADMIN, [USER_ROLES.ADMIN]), true);
});

test('roleSatisfies: a super_admin satisfies an admin-only check (superset)', () => {
  assert.equal(roleSatisfies(USER_ROLES.SUPER_ADMIN, [USER_ROLES.ADMIN]), true);
});

test('roleSatisfies: an admin does NOT satisfy a super_admin-only check', () => {
  assert.equal(roleSatisfies(USER_ROLES.ADMIN, [USER_ROLES.SUPER_ADMIN]), false);
});

test('roleSatisfies: a super_admin satisfies a super_admin-only check', () => {
  assert.equal(roleSatisfies(USER_ROLES.SUPER_ADMIN, [USER_ROLES.SUPER_ADMIN]), true);
});

test('canAssignRole: an actor can never change their own role, even a super_admin', () => {
  const result = canAssignRole({
    actorId: 'u1',
    actorRole: USER_ROLES.SUPER_ADMIN,
    targetId: 'u1',
    targetCurrentRole: USER_ROLES.SUPER_ADMIN,
    requestedRole: USER_ROLES.SUPER_ADMIN,
  });
  assert.equal(result.allowed, false);
});

test('canAssignRole: a plain admin cannot grant admin to another user (privilege escalation)', () => {
  const result = canAssignRole({
    actorId: 'admin1',
    actorRole: USER_ROLES.ADMIN,
    targetId: 'user1',
    targetCurrentRole: USER_ROLES.USER,
    requestedRole: USER_ROLES.ADMIN,
  });
  assert.equal(result.allowed, false);
});

test('canAssignRole: a plain admin cannot grant super_admin to another user', () => {
  const result = canAssignRole({
    actorId: 'admin1',
    actorRole: USER_ROLES.ADMIN,
    targetId: 'user1',
    targetCurrentRole: USER_ROLES.USER,
    requestedRole: USER_ROLES.SUPER_ADMIN,
  });
  assert.equal(result.allowed, false);
});

test('canAssignRole: a plain admin cannot change an existing admin\'s role at all, even demoting them', () => {
  const result = canAssignRole({
    actorId: 'admin1',
    actorRole: USER_ROLES.ADMIN,
    targetId: 'admin2',
    targetCurrentRole: USER_ROLES.ADMIN,
    requestedRole: USER_ROLES.USER,
  });
  assert.equal(result.allowed, false);
});

test('canAssignRole: a plain admin CAN set a plain user\'s role to user (no-op, but not touching anything elevated)', () => {
  const result = canAssignRole({
    actorId: 'admin1',
    actorRole: USER_ROLES.ADMIN,
    targetId: 'user1',
    targetCurrentRole: USER_ROLES.USER,
    requestedRole: USER_ROLES.USER,
  });
  assert.equal(result.allowed, true);
});

test('canAssignRole: a super_admin CAN grant admin to another user', () => {
  const result = canAssignRole({
    actorId: 'super1',
    actorRole: USER_ROLES.SUPER_ADMIN,
    targetId: 'user1',
    targetCurrentRole: USER_ROLES.USER,
    requestedRole: USER_ROLES.ADMIN,
  });
  assert.equal(result.allowed, true);
});

test('canAssignRole: a super_admin CAN demote another admin back to user', () => {
  const result = canAssignRole({
    actorId: 'super1',
    actorRole: USER_ROLES.SUPER_ADMIN,
    targetId: 'admin1',
    targetCurrentRole: USER_ROLES.ADMIN,
    requestedRole: USER_ROLES.USER,
  });
  assert.equal(result.allowed, true);
});
