import type { Db } from '../db/connection';

export interface AuthUser {
  id: number;
  employee_id: number | null;
  department_id: number | null;
  email: string;
  password_hash: string;
  full_name: string;
  is_active: number;
  failed_login_attempts: number;
  locked_until: string | null;
  mfa_enabled: number;
}

export interface RefreshTokenRecord {
  id: string;
  session_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  user_id: number;
  session_expires_at: string;
  session_revoked_at: string | null;
}

export interface MfaFactorRecord {
  id: string;
  user_id: number;
  secret_encrypted: string;
  verified_at: string | null;
  last_used_step: number | null;
}

export interface MfaChallengeRecord {
  id: string;
  user_id: number;
  expires_at: string;
  verified_at: string | null;
  attempts: number;
}

export interface SessionRecord {
  id: string;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface AuditLogRecord {
  id: number;
  user_id: number | null;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  details: string | null;
  created_at: string;
}

export class AuthRepository {
  constructor(private readonly db: Db) {}

  findUserByEmail(email: string): AuthUser | undefined {
    return this.db.prepare(`
      SELECT id, employee_id, department_id, email, password_hash,
             full_name, is_active, failed_login_attempts, locked_until,
             mfa_enabled
      FROM users WHERE email = ? COLLATE NOCASE
    `).get(email) as AuthUser | undefined;
  }

  findUserById(userId: number): AuthUser | undefined {
    return this.db.prepare(`
      SELECT id, employee_id, department_id, email, password_hash,
             full_name, is_active, failed_login_attempts, locked_until,
             mfa_enabled
      FROM users WHERE id = ?
    `).get(userId) as AuthUser | undefined;
  }

  getUserRoles(userId: number): string[] {
    const rows = this.db.prepare(`
      SELECT r.name FROM roles r
      INNER JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = ? ORDER BY r.name
    `).all(userId) as Array<{ name: string }>;
    return rows.map((row) => row.name);
  }

  getUserPermissions(userId: number): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT p.name FROM permissions p
      INNER JOIN role_permissions rp ON rp.permission_id = p.id
      INNER JOIN user_roles ur ON ur.role_id = rp.role_id
      WHERE ur.user_id = ? ORDER BY p.name
    `).all(userId) as Array<{ name: string }>;
    return rows.map((row) => row.name);
  }

  recordFailedLogin(userId: number, maxAttempts = 5, lockMinutes = 15): void {
    const lockedUntil = new Date(Date.now() + lockMinutes * 60_000).toISOString();
    this.db.prepare(`
      UPDATE users SET
        failed_login_attempts = failed_login_attempts + 1,
        locked_until = CASE WHEN failed_login_attempts + 1 >= ? THEN ? ELSE locked_until END,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(maxAttempts, lockedUntil, userId);
  }

  resetFailedLogins(userId: number): void {
    this.db.prepare(`
      UPDATE users SET failed_login_attempts = 0, locked_until = NULL,
        updated_at = datetime('now') WHERE id = ?
    `).run(userId);
  }

  createSession(sessionId: string, userId: number, expiresAt: string): void {
    this.db.prepare(`
      INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)
    `).run(sessionId, userId, expiresAt);
  }

  createRefreshToken(tokenId: string, sessionId: string, tokenHash: string, expiresAt: string): void {
    this.db.prepare(`
      INSERT INTO refresh_tokens (id, session_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(tokenId, sessionId, tokenHash, expiresAt);
  }

  findRefreshToken(tokenHash: string): RefreshTokenRecord | undefined {
    return this.db.prepare(`
      SELECT rt.id, rt.session_id, rt.token_hash, rt.expires_at,
             rt.used_at, rt.revoked_at, s.user_id,
             s.expires_at AS session_expires_at,
             s.revoked_at AS session_revoked_at
      FROM refresh_tokens rt
      INNER JOIN sessions s ON s.id = rt.session_id
      WHERE rt.token_hash = ?
    `).get(tokenHash) as RefreshTokenRecord | undefined;
  }

  rotateRefreshToken(
    oldTokenId: string,
    newTokenId: string,
    sessionId: string,
    newTokenHash: string,
    expiresAt: string,
  ): boolean {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = this.db.prepare(`
        UPDATE refresh_tokens SET used_at = datetime('now')
        WHERE id = ? AND session_id = ? AND used_at IS NULL AND revoked_at IS NULL
      `).run(oldTokenId, sessionId);
      if (Number(result.changes) !== 1) {
        this.db.exec('ROLLBACK');
        return false;
      }
      this.db.prepare(`
        INSERT INTO refresh_tokens (id, session_id, token_hash, expires_at)
        VALUES (?, ?, ?, ?)
      `).run(newTokenId, sessionId, newTokenHash, expiresAt);
      this.db.prepare(`UPDATE sessions SET last_used_at = datetime('now') WHERE id = ?`).run(sessionId);
      this.db.exec('COMMIT');
      return true;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  revokeSession(sessionId: string): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL`).run(sessionId);
      this.db.prepare(`UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE session_id = ? AND revoked_at IS NULL`).run(sessionId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  revokeAllUserSessions(userId: number): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`).run(userId);
      this.db.prepare(`UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?) AND revoked_at IS NULL`).run(userId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  isSessionActive(sessionId: string, userId: number): boolean {
    const row = this.db.prepare(`
      SELECT id FROM sessions WHERE id = ? AND user_id = ?
        AND revoked_at IS NULL AND julianday(expires_at) > julianday('now')
    `).get(sessionId, userId);
    if (row) this.db.prepare(`UPDATE sessions SET last_used_at = datetime('now') WHERE id = ?`).run(sessionId);
    return Boolean(row);
  }

  listSessions(userId: number): SessionRecord[] {
    return this.db.prepare(`
      SELECT id, created_at, expires_at, last_used_at, revoked_at
      FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
   `).all(userId) as unknown as SessionRecord[];
  }

  revokeSessionForUser(sessionId: string, userId: number): boolean {
    const owner = this.db.prepare(`SELECT id FROM sessions WHERE id = ? AND user_id = ?`).get(sessionId, userId);
    if (!owner) return false;
    this.revokeSession(sessionId);
    return true;
  }

  saveMfaFactor(factorId: string, userId: number, encryptedSecret: string): void {
    this.db.prepare(`DELETE FROM mfa_factors WHERE user_id = ?`).run(userId);
    this.db.prepare(`
      INSERT INTO mfa_factors (id, user_id, factor_type, secret_encrypted, verified_at)
      VALUES (?, ?, 'TOTP', ?, NULL)
    `).run(factorId, userId, encryptedSecret);
    this.db.prepare(`UPDATE users SET mfa_enabled = 0 WHERE id = ?`).run(userId);
  }

  getMfaFactor(userId: number, verifiedOnly = true): MfaFactorRecord | undefined {
    return this.db.prepare(`
      SELECT id, user_id, secret_encrypted, verified_at, last_used_step
      FROM mfa_factors WHERE user_id = ? ${verifiedOnly ? 'AND verified_at IS NOT NULL' : ''}
      ORDER BY created_at DESC LIMIT 1
    `).get(userId) as MfaFactorRecord | undefined;
  }

  verifyMfaFactor(userId: number, factorId: string, step: number): void {
    this.db.prepare(`UPDATE mfa_factors SET verified_at = datetime('now'), last_used_step = ? WHERE id = ? AND user_id = ?`).run(step, factorId, userId);
    this.db.prepare(`UPDATE users SET mfa_enabled = 1, updated_at = datetime('now') WHERE id = ?`).run(userId);
  }

  consumeMfaStep(userId: number, factorId: string, step: number): boolean {
    const result = this.db.prepare(`
      UPDATE mfa_factors SET last_used_step = ?
      WHERE id = ? AND user_id = ? AND verified_at IS NOT NULL
        AND (last_used_step IS NULL OR last_used_step < ?)
    `).run(step, factorId, userId, step);
    return Number(result.changes) === 1;
  }

  disableMfa(userId: number): void {
    this.db.prepare(`UPDATE users SET mfa_enabled = 0, updated_at = datetime('now') WHERE id = ?`).run(userId);
    this.db.prepare(`DELETE FROM mfa_factors WHERE user_id = ?`).run(userId);
  }

  createMfaChallenge(challengeId: string, userId: number, expiresAt: string): void {
    this.db.prepare(`
      INSERT INTO mfa_challenges (id, user_id, expires_at) VALUES (?, ?, ?)
    `).run(challengeId, userId, expiresAt);
  }

  findMfaChallenge(challengeId: string): MfaChallengeRecord | undefined {
    return this.db.prepare(`
      SELECT id, user_id, expires_at, verified_at, attempts
      FROM mfa_challenges WHERE id = ?
    `).get(challengeId) as MfaChallengeRecord | undefined;
  }

  incrementMfaChallengeAttempts(challengeId: string): void {
    this.db.prepare(`UPDATE mfa_challenges SET attempts = attempts + 1 WHERE id = ?`).run(challengeId);
  }

  markMfaChallengeVerified(challengeId: string): void {
    this.db.prepare(`UPDATE mfa_challenges SET verified_at = datetime('now') WHERE id = ?`).run(challengeId);
  }

  writeAuditLog(
    userId: number | null,
    eventType: string,
    ipAddress: string | null,
    userAgent: string | null,
    details?: Record<string, unknown>,
  ): void {
    this.db.prepare(`
      INSERT INTO audit_logs (user_id, event_type, ip_address, user_agent, details)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, eventType, ipAddress, userAgent, details ? (JSON.stringify(details) ?? null) : null);
  }

  listAuditLogs(limit: number, offset: number): AuditLogRecord[] {
    return this.db.prepare(`
      SELECT id, user_id, event_type, ip_address, user_agent, details, created_at
      FROM audit_logs ORDER BY id DESC LIMIT ? OFFSET ?
    `).all(limit, offset) as unknown as AuditLogRecord[];
  }
}
