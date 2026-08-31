import { USER_ROLES } from '../constants/enums.js';

/**
 * super_admin is a strict superset of admin — every capability an admin
 * has, a super_admin also has, plus role-management (see
 * canAssignRole below). Kept as an explicit map rather than a numeric
 * "rank" so a future third admin tier doesn't silently inherit assumptions
 * about ordering.
 */
const ROLE_IMPLIES = {
  [USER_ROLES.SUPER_ADMIN]: [USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN],
  [USER_ROLES.ADMIN]: [USER_ROLES.ADMIN],
  [USER_ROLES.USER]: [USER_ROLES.USER],
};

/**
 * True if a user with `userRole` satisfies a route/action that requires
 * being one of `allowedRoles`. Pulled out of middleware/auth.js so it's
 * testable without an Express req/res.
 */
export function roleSatisfies(userRole, allowedRoles) {
  const effectiveRoles = ROLE_IMPLIES[userRole] ?? [userRole];
  return allowedRoles.some((allowed) => effectiveRoles.includes(allowed));
}

const ELEVATED_ROLES = [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN];

/**
 * Decides whether an admin-role-change request is allowed, independent of
 * any database access — so this is unit-testable in isolation and the
 * actual privilege-escalation rules are readable in one place instead of
 * scattered through a service function's control flow.
 *
 * Rules (SRS PHASE_04: "Prevent privilege escalation"):
 *  1. An actor can never change their OWN role — self-service role changes
 *     (either direction) are always refused, whether promoting or
 *     demoting, admin or not. Prevents both self-escalation and a
 *     confused-deputy "I meant to click someone else" accidental
 *     self-demotion.
 *  2. Only a super_admin may grant admin or super_admin — a plain admin
 *     granting another account 'admin' would let two colluding regular
 *     admins mint arbitrary new admins, bypassing this whole check.
 *  3. Only a super_admin may change the role of an existing admin or
 *     super_admin (demote/reassign) — a plain admin cannot touch another
 *     admin's privileges at all, elevated or not.
 *  4. A plain admin CAN still promote/demote a plain 'user' to/from
 *     nothing-elevated — i.e. there's currently no non-admin role to
 *     assign other than 'user' itself, so in practice rule 2 already
 *     covers everything a plain admin might request; this rule exists so
 *     the function's contract is explicit rather than "whatever falls
 *     through", in case a future role (e.g. a moderator tier) is added
 *     between 'user' and 'admin'.
 *
 * @param {{ actorId: string, actorRole: string, targetId: string, targetCurrentRole: string, requestedRole: string }} params
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function canAssignRole({ actorId, actorRole, targetId, targetCurrentRole, requestedRole }) {
  if (actorId.toString() === targetId.toString()) {
    return { allowed: false, reason: 'You cannot change your own role' };
  }

  const grantingElevated = ELEVATED_ROLES.includes(requestedRole);
  const targetIsElevated = ELEVATED_ROLES.includes(targetCurrentRole);

  if ((grantingElevated || targetIsElevated) && actorRole !== USER_ROLES.SUPER_ADMIN) {
    return {
      allowed: false,
      reason: 'Only a super_admin can grant admin/super_admin or change an existing admin\'s role',
    };
  }

  return { allowed: true };
}
