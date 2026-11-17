import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { SignJWT, jwtVerify } from 'jose';

import { config } from '../config';
import {
  AuthRepository,
  type AuthUser,
  type SessionRecord,
  type AuditLogRecord,
} from '../repositories/AuthRepository';

const JWT_KEY = new TextEncoder().encode(config.jwtSecret);
const MFA_KEY = Buffer.from(config.mfaEncryptionKey, 'hex');
const PASSWORD_COST = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const MFA_CHALLENGE_MINUTES = 5;
const MFA_MAX_ATTEMPTS = 5;

authenticator.options = { step: 30, window: 1 };

export interface AuthenticatedUser {
  id: number;
  employeeId: number | null;
  departmentId: number | null;
  email: string;
  fullName: string;
  mfaEnabled: boolean;
  roles: string[];
  permissions: string[];
}

export interface RequestMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
  expiresIn: number;
}

export interface MfaChallengeResult {
  mfaRequired: true;
  challengeId: string;
  expiresIn: number;
}

export type LoginResponse = LoginResult | MfaChallengeResult;

export interface AccessTokenPayload {
  userId: number;
  sessionId: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', MFA_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

function decryptSecret(value: string): string {
  const [ivText, tagText, encryptedText] = value.split('.');
  if (!ivText || !tagText || !encryptedText) throw new Error('Invalid encrypted MFA secret.');
  const decipher = createDecipheriv('aes-256-gcm', MFA_KEY, Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function toAuthenticatedUser(user: AuthUser, roles: string[], permissions: string[]): AuthenticatedUser {
  return {
    id: user.id,
    employeeId: user.employee_id,
    departmentId: user.department_id,
    email: user.email,
    fullName: user.full_name,
    mfaEnabled: user.mfa_enabled === 1,
    roles,
    permissions,
  };
}

function isAccountLocked(user: AuthUser): boolean {
  return Boolean(user.locked_until && new Date(user.locked_until).getTime() > Date.now());
}

export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  private audit(userId: number | null, event: string, metadata: RequestMetadata = {}, details?: Record<string, unknown>): void {
    this.repository.writeAuditLog(
      userId,
      event,
      metadata.ipAddress ?? null,
      metadata.userAgent ?? null,
      details,
    );
  }

  async hashPassword(password: string): Promise<string> {
    this.validatePassword(password);
    return bcrypt.hash(password, PASSWORD_COST);
  }

  async verifyPassword(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }

  private validatePassword(password: string): void {
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
      throw new Error('Password must contain between 12 and 128 characters.');
    }
  }

  private async createAccessToken(user: AuthenticatedUser, sessionId: string): Promise<string> {
    return new SignJWT({ email: user.email, roles: user.roles, sid: sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(String(user.id))
      .setIssuedAt()
      .setIssuer('workforce-analytics-api')
      .setAudience('workforce-analytics-client')
      .setExpirationTime(`${config.accessTokenMinutes}m`)
      .sign(JWT_KEY);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const { payload } = await jwtVerify(token, JWT_KEY, {
      issuer: 'workforce-analytics-api',
      audience: 'workforce-analytics-client',
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      throw new Error('Invalid access token.');
    }
    const userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('Invalid access token.');
    return { userId, sessionId: payload.sid };
  }

  async login(
    email: string,
    password: string,
    expectedRole?: string,
    metadata: RequestMetadata = {},
  ): Promise<LoginResponse> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = this.repository.findUserByEmail(normalizedEmail);
    if (!user || !user.is_active) {
      this.audit(null, 'LOGIN_FAILED', metadata, { reason: 'invalid_credentials' });
      throw new Error('Invalid email or password.');
    }
    if (isAccountLocked(user)) {
      this.audit(user.id, 'LOGIN_BLOCKED', metadata, { reason: 'account_locked' });
      throw new Error('Account temporarily locked. Please try again later.');
    }
    const passwordMatches = await this.verifyPassword(password, user.password_hash);
    if (!passwordMatches) {
      this.repository.recordFailedLogin(user.id, MAX_LOGIN_ATTEMPTS, LOCK_MINUTES);
      this.audit(user.id, 'LOGIN_FAILED', metadata, { reason: 'invalid_credentials' });
      throw new Error('Invalid email or password.');
    }

    this.repository.resetFailedLogins(user.id);
    const roles = this.repository.getUserRoles(user.id);
    if (!roles.length) {
      this.audit(user.id, 'LOGIN_BLOCKED', metadata, { reason: 'no_role_assigned' });
      throw new Error('This account has no assigned role. Contact an administrator.');
    }
    if (expectedRole && !roles.some((role) => role.toLowerCase() === expectedRole.toLowerCase())) {
      this.audit(user.id, 'LOGIN_ROLE_MISMATCH', metadata, { selectedRole: expectedRole });
      throw new Error('This account does not have the selected role. Choose the correct login portal.');
    }

    if (user.mfa_enabled) {
      const factor = this.repository.getMfaFactor(user.id, true);
      if (!factor) throw new Error('MFA is enabled but no verified authenticator is configured. Contact an administrator.');
      const challengeId = randomUUID();
      const expiresAt = new Date(Date.now() + MFA_CHALLENGE_MINUTES * 60_000).toISOString();
      this.repository.createMfaChallenge(challengeId, user.id, expiresAt);
      this.audit(user.id, 'MFA_CHALLENGE_CREATED', metadata);
      return { mfaRequired: true, challengeId, expiresIn: MFA_CHALLENGE_MINUTES * 60 };
    }

    const result = await this.createLoginSession(user);
    this.audit(user.id, 'LOGIN_SUCCESS', metadata);
    return result;
  }

  async beginMfaSetup(userId: number, email: string, metadata: RequestMetadata = {}): Promise<{ secret: string; otpauthUrl: string }> {
    const secret = authenticator.generateSecret();
    const factorId = randomUUID();
    this.repository.saveMfaFactor(factorId, userId, encryptSecret(secret));
    const otpauthUrl = authenticator.keyuri(email, 'Workforce Analytics', secret);
    this.audit(userId, 'MFA_SETUP_STARTED', metadata);
    return { secret, otpauthUrl };
  }

  async verifyMfaSetup(userId: number, token: string, metadata: RequestMetadata = {}): Promise<void> {
    if (!/^\d{6}$/.test(token)) throw new Error('Enter the six-digit authenticator code.');
    const factor = this.repository.getMfaFactor(userId, false);
    if (!factor || factor.verified_at) throw new Error('No pending MFA setup was found. Start setup again.');
    const secret = decryptSecret(factor.secret_encrypted);
    const delta = authenticator.checkDelta(token, secret);
    if (delta === null) throw new Error('Invalid authenticator code. Try again.');
    const step = Math.floor(Date.now() / 30_000) + delta;
    this.repository.verifyMfaFactor(userId, factor.id, step);
    this.audit(userId, 'MFA_ENABLED', metadata);
  }

  async verifyMfaLogin(challengeId: string, token: string, metadata: RequestMetadata = {}): Promise<LoginResult> {
    if (!/^\d{6}$/.test(token)) throw new Error('Enter the six-digit authenticator code.');
    const challenge = this.repository.findMfaChallenge(challengeId);
    if (!challenge || challenge.verified_at || new Date(challenge.expires_at).getTime() <= Date.now() || challenge.attempts >= MFA_MAX_ATTEMPTS) {
      throw new Error('This MFA challenge has expired. Please sign in again.');
    }
    const user = this.repository.findUserById(challenge.user_id);
    const factor = this.repository.getMfaFactor(challenge.user_id, true);
    if (!user || !user.is_active || !factor) throw new Error('MFA verification is unavailable for this account.');
    const secret = decryptSecret(factor.secret_encrypted);
    const delta = authenticator.checkDelta(token, secret);
    const step = delta === null ? null : Math.floor(Date.now() / 30_000) + delta;
    if (step === null || !this.repository.consumeMfaStep(user.id, factor.id, step)) {
      this.repository.incrementMfaChallengeAttempts(challengeId);
      this.audit(user.id, 'MFA_VERIFICATION_FAILED', metadata);
      throw new Error('Invalid authenticator code. Try again.');
    }
    this.repository.markMfaChallengeVerified(challengeId);
    const result = await this.createLoginSession(user);
    this.audit(user.id, 'MFA_VERIFICATION_SUCCESS', metadata);
    this.audit(user.id, 'LOGIN_SUCCESS', metadata, { mfa: true });
    return result;
  }

  private async createLoginSession(user: AuthUser): Promise<LoginResult> {
    const sessionId = randomUUID();
    const tokenId = randomUUID();
    const refreshToken = randomBytes(48).toString('base64url');
    const sessionExpiry = new Date(Date.now() + config.refreshTokenDays * 86_400_000);
    const roles = this.repository.getUserRoles(user.id);
    const permissions = this.repository.getUserPermissions(user.id);
    const authenticatedUser = toAuthenticatedUser(user, roles, permissions);
    const accessToken = await this.createAccessToken(authenticatedUser, sessionId);
    this.repository.createSession(sessionId, user.id, sessionExpiry.toISOString());
    this.repository.createRefreshToken(tokenId, sessionId, hashToken(refreshToken), sessionExpiry.toISOString());
    return { accessToken, refreshToken, user: authenticatedUser, expiresIn: config.accessTokenMinutes * 60 };
  }

  async refresh(refreshToken: string, metadata: RequestMetadata = {}): Promise<LoginResult> {
    if (typeof refreshToken !== 'string' || refreshToken.length < 32 || refreshToken.length > 256) {
      throw new Error('Invalid refresh token.');
    }
    const record = this.repository.findRefreshToken(hashToken(refreshToken));
    if (!record) throw new Error('Invalid refresh token.');
    if (record.used_at || record.revoked_at) {
      this.repository.revokeSession(record.session_id);
      this.audit(record.user_id, 'REFRESH_TOKEN_REUSE_DETECTED', metadata);
      throw new Error('Refresh token reuse detected.');
    }
    const now = Date.now();
    if (new Date(record.expires_at).getTime() <= now || new Date(record.session_expires_at).getTime() <= now || record.session_revoked_at) {
      this.repository.revokeSession(record.session_id);
      throw new Error('Session expired.');
    }
    const user = this.repository.findUserById(record.user_id);
    if (!user || !user.is_active) {
      this.repository.revokeSession(record.session_id);
      throw new Error('Account unavailable.');
    }
    const newRefreshToken = randomBytes(48).toString('base64url');
    const newTokenId = randomUUID();
    const roles = this.repository.getUserRoles(user.id);
    const permissions = this.repository.getUserPermissions(user.id);
    const authenticatedUser = toAuthenticatedUser(user, roles, permissions);
    const accessToken = await this.createAccessToken(authenticatedUser, record.session_id);
    const rotated = this.repository.rotateRefreshToken(record.id, newTokenId, record.session_id, hashToken(newRefreshToken), record.session_expires_at);
    if (!rotated) throw new Error('Refresh token is no longer valid.');
    this.audit(user.id, 'TOKEN_REFRESHED', metadata);
    return { accessToken, refreshToken: newRefreshToken, user: authenticatedUser, expiresIn: config.accessTokenMinutes * 60 };
  }

  async getCurrentUser(accessToken: string): Promise<AuthenticatedUser> {
    const payload = await this.verifyAccessToken(accessToken);
    if (!this.repository.isSessionActive(payload.sessionId, payload.userId)) throw new Error('Session is invalid or expired.');
    const user = this.repository.findUserById(payload.userId);
    if (!user || !user.is_active) throw new Error('Account unavailable.');
    return toAuthenticatedUser(user, this.repository.getUserRoles(user.id), this.repository.getUserPermissions(user.id));
  }

  logout(sessionId: string, userId: number, metadata: RequestMetadata = {}): void {
    this.repository.revokeSession(sessionId);
    this.audit(userId, 'LOGOUT_SUCCESS', metadata);
  }

  getSessions(userId: number): SessionRecord[] {
    return this.repository.listSessions(userId);
  }

  revokeSession(sessionId: string, userId: number, metadata: RequestMetadata = {}): boolean {
    const revoked = this.repository.revokeSessionForUser(sessionId, userId);
    if (revoked) this.audit(userId, 'SESSION_REVOKED', metadata);
    return revoked;
  }

  getAuditLogs(limit: number, offset: number): AuditLogRecord[] {
    return this.repository.listAuditLogs(limit, offset);
  }
}
