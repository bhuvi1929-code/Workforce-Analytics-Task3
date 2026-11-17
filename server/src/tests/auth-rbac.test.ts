import assert from 'node:assert/strict';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { AuthRepository } from '../repositories/AuthRepository';
import { AuthService } from '../services/AuthService';
import { openDatabase } from '../db/connection';
import { seedDatabase } from '../db/seed';

const PASSWORD = 'Unit-Test-Password-123!';

async function setup(role = 'Admin') {
  const db = openDatabase(':memory:');
  seedDatabase(db, '2026-11-17');
  const roleRow = db.prepare('SELECT id FROM roles WHERE name = ?').get(role) as { id: number };
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, full_name, is_active, mfa_enabled)
    VALUES (?, ?, ?, 1, 0)
  `).run(`test-${role.toLowerCase().replace(/\s/g, '')}@example.test`, passwordHash, `${role} Test`);
  const userId = Number(result.lastInsertRowid);
  db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, roleRow.id);
  const repository = new AuthRepository(db);
  const auth = new AuthService(repository);
  return { db, auth, repository, userId, email: `test-${role.toLowerCase().replace(/\s/g, '')}@example.test` };
}

test('login verifies password and returns database-backed role permissions', async (t) => {
  const ctx = await setup('Admin');
  t.after(() => ctx.db.close());
  const result = await ctx.auth.login(ctx.email, PASSWORD, 'Admin');
  assert.equal('mfaRequired' in result, false);
  if ('mfaRequired' in result) return;
  assert.ok(result.accessToken.length > 20);
  assert.deepEqual(result.user.roles, ['Admin']);
  assert.ok(result.user.permissions.includes('users:manage'));
  const current = await ctx.auth.getCurrentUser(result.accessToken);
  assert.equal(current.id, ctx.userId);
});

test('login rejects a mismatched portal role without creating a session', async (t) => {
  const ctx = await setup('HR');
  t.after(() => ctx.db.close());
  await assert.rejects(ctx.auth.login(ctx.email, PASSWORD, 'Admin'), /selected role/i);
  assert.equal((ctx.db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n, 0);
  assert.equal((ctx.db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE event_type = 'LOGIN_ROLE_MISMATCH'").get() as { n: number }).n, 1);
});

test('refresh token rotation invalidates the previous token and reuse revokes the session', async (t) => {
  const ctx = await setup('Admin');
  t.after(() => ctx.db.close());
  const login = await ctx.auth.login(ctx.email, PASSWORD, 'Admin');
  assert.equal('mfaRequired' in login, false);
  if ('mfaRequired' in login) return;
  const rotated = await ctx.auth.refresh(login.refreshToken);
  await assert.rejects(ctx.auth.refresh(login.refreshToken));
  await assert.rejects(ctx.auth.refresh(rotated.refreshToken));
});

test('MFA setup encrypts the TOTP secret and enables MFA only after code verification', async (t) => {
  const ctx = await setup('Admin');
  t.after(() => ctx.db.close());
  const setupResult = await ctx.auth.beginMfaSetup(ctx.userId, ctx.email);
  assert.ok(setupResult.otpauthUrl.startsWith('otpauth://totp/'));
  const stored = ctx.db.prepare('SELECT secret_encrypted FROM mfa_factors WHERE user_id = ?').get(ctx.userId) as { secret_encrypted: string };
  assert.notEqual(stored.secret_encrypted, setupResult.secret);
  const setupCode = authenticator.generate(setupResult.secret);
  await ctx.auth.verifyMfaSetup(ctx.userId, setupCode);
  const user = ctx.db.prepare('SELECT mfa_enabled FROM users WHERE id = ?').get(ctx.userId) as { mfa_enabled: number };
  assert.equal(user.mfa_enabled, 1);

  // Move the stored step back in this isolated test so the login flow can use a fresh TOTP step.
  ctx.db.prepare('UPDATE mfa_factors SET last_used_step = ? WHERE user_id = ?')
    .run(Math.floor(Date.now() / 30_000) - 2, ctx.userId);
  const challenge = await ctx.auth.login(ctx.email, PASSWORD, 'Admin');
  assert.equal('mfaRequired' in challenge, true);
  if (!('mfaRequired' in challenge)) return;
  const loginCode = authenticator.generate(setupResult.secret);
  const completedLogin = await ctx.auth.verifyMfaLogin(challenge.challengeId, loginCode);
  assert.ok(completedLogin.accessToken);

  const replayChallenge = await ctx.auth.login(ctx.email, PASSWORD, 'Admin');
  assert.equal('mfaRequired' in replayChallenge, true);
  if ('mfaRequired' in replayChallenge) {
    await assert.rejects(ctx.auth.verifyMfaLogin(replayChallenge.challengeId, loginCode), /Invalid authenticator code/);
  }
  assert.equal((ctx.db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE event_type = 'MFA_ENABLED'").get() as { n: number }).n, 1);
});

test('five failed passwords lock an account', async (t) => {
  const ctx = await setup('Employee');
  t.after(() => ctx.db.close());
  for (let i = 0; i < 5; i++) {
    await assert.rejects(ctx.auth.login(ctx.email, 'wrong-password', 'Employee'), /Invalid email or password/);
  }
  await assert.rejects(ctx.auth.login(ctx.email, PASSWORD, 'Employee'), /temporarily locked/);
  const user = ctx.db.prepare('SELECT failed_login_attempts, locked_until FROM users WHERE id = ?').get(ctx.userId) as { failed_login_attempts: number; locked_until: string | null };
  assert.equal(user.failed_login_attempts, 5);
  assert.ok(user.locked_until);
});
