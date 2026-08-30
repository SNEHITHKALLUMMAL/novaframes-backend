/**
 * REQUIRES npm install (zod) — this sandbox has no network access to
 * install packages, so this suite could not be executed here. Written and
 * reviewed against the actual schemas in auth.validator.js; run it as the
 * first thing after `npm install` locally to confirm.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  deleteAccountSchema,
} from './auth.validator.js';

test('registerSchema: accepts a valid registration payload', () => {
  const result = registerSchema.safeParse({ name: 'Ada', email: 'ADA@Example.com', password: 'longenough' });
  assert.equal(result.success, true);
  // email is lowercased and trimmed by the schema itself
  assert.equal(result.data.email, 'ada@example.com');
});

test('registerSchema: rejects a name under 2 characters', () => {
  const result = registerSchema.safeParse({ name: 'A', email: 'a@b.com', password: 'longenough' });
  assert.equal(result.success, false);
});

test('registerSchema: rejects an invalid email', () => {
  const result = registerSchema.safeParse({ name: 'Ada', email: 'not-an-email', password: 'longenough' });
  assert.equal(result.success, false);
});

test('registerSchema: rejects a password under 8 characters', () => {
  const result = registerSchema.safeParse({ name: 'Ada', email: 'a@b.com', password: 'short' });
  assert.equal(result.success, false);
});

test('loginSchema: only requires a non-empty password (no length floor at login)', () => {
  const result = loginSchema.safeParse({ email: 'a@b.com', password: 'x' });
  assert.equal(result.success, true);
});

test('updateProfileSchema: every field is optional (a partial update is valid)', () => {
  const result = updateProfileSchema.safeParse({});
  assert.equal(result.success, true);
});

test('updateProfileSchema: rejects a non-URL avatarUrl', () => {
  const result = updateProfileSchema.safeParse({ avatarUrl: 'not-a-url' });
  assert.equal(result.success, false);
});

test('updateProfileSchema: allows avatarUrl to be explicitly null (clearing it)', () => {
  const result = updateProfileSchema.safeParse({ avatarUrl: null });
  assert.equal(result.success, true);
});

test('changePasswordSchema: rejects when new password equals current password', () => {
  const result = changePasswordSchema.safeParse({
    currentPassword: 'samepassword',
    newPassword: 'samepassword',
  });
  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].path[0], 'newPassword');
});

test('changePasswordSchema: accepts a genuinely different new password', () => {
  const result = changePasswordSchema.safeParse({
    currentPassword: 'oldpassword',
    newPassword: 'newpassword123',
  });
  assert.equal(result.success, true);
});

test('deleteAccountSchema: requires a non-empty password', () => {
  assert.equal(deleteAccountSchema.safeParse({ password: '' }).success, false);
  assert.equal(deleteAccountSchema.safeParse({ password: 'x' }).success, true);
});
