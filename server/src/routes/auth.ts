import { Router, type Request, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import * as QRCode from 'qrcode';

import { config } from '../config';
import type { AuthenticatedUser, AuthService, RequestMetadata } from '../services/AuthService';

const REFRESH_COOKIE = 'wfa_refresh';

const cookieOptions = {
  httpOnly: true,
  secure: config.cookieSecure || config.isProduction,
  sameSite: 'lax' as const,
  path: '/api/auth',
};

const refreshCookieOptions = {
  ...cookieOptions,
  maxAge: config.refreshTokenDays * 24 * 60 * 60 * 1000,
};

function isTrustedOrigin(origin: string | undefined): boolean {
  return origin === config.frontendOrigin;
}

function metadata(req: Request): RequestMetadata {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? null,
  };
}

function getRequestBody(body: unknown): Record<string, unknown> | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function validCode(value: unknown): value is string {
  return typeof value === 'string' && /^\d{6}$/.test(value);
}

function sendLoginResult(
  result: Awaited<ReturnType<AuthService['login']>>,
  res: import('express').Response,
): void {
  if ('mfaRequired' in result) {
    res.status(202).json(result);
    return;
  }
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);
  res.status(200).json({
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
    user: result.user,
  });
}

/** Verifies the access token and checks that its session is still active. */
export function requireAuth(auth: AuthService): RequestHandler {
  return async (req, res, next) => {
    const authorization = req.get('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match?.[1]) {
      res.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Please sign in to continue.' } });
      return;
    }
    try {
      const user = await auth.getCurrentUser(match[1]);
      const payload = await auth.verifyAccessToken(match[1]);
      res.locals.authUser = user;
      res.locals.sessionId = payload.sessionId;
      next();
    } catch {
      res.status(401).json({ error: { code: 'INVALID_SESSION', message: 'Your session is invalid or expired. Please sign in again.' } });
    }
  };
}

/** Checks whether the authenticated user has a required permission. */
export function requirePermission(permission: string): RequestHandler {
  return (_req, res, next) => {
    const user = res.locals.authUser as AuthenticatedUser | undefined;
    if (!user) {
      res.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Please sign in to continue.' } });
      return;
    }
    if (!user.permissions.includes(permission)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action.' } });
      return;
    }
    next();
  };
}

export function buildAuthRouter(auth: AuthService): Router {
  const router = Router();
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'TOO_MANY_LOGIN_ATTEMPTS', message: 'Too many login attempts. Please try again later.' } },
  });
  const mfaLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'TOO_MANY_MFA_ATTEMPTS', message: 'Too many verification attempts. Please try again later.' } },
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const body = getRequestBody(req.body);
    const email = body?.email;
    const password = body?.password;
    const expectedRole = body?.expectedRole;
    if (
      typeof email !== 'string' || email.length > 254 ||
      typeof password !== 'string' || password.length > 128 ||
      (expectedRole !== undefined && (typeof expectedRole !== 'string' || !['Admin', 'HR', 'Manager', 'Team Lead', 'Employee'].includes(expectedRole)))
    ) {
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Enter a valid email address, password and login role.' } });
      return;
    }
    if (req.get('origin') && !isTrustedOrigin(req.get('origin'))) {
      res.status(403).json({ error: { code: 'INVALID_ORIGIN', message: 'Request origin is not allowed.' } });
      return;
    }
    try {
      const result = await auth.login(email, password, expectedRole as string | undefined, metadata(req));
      sendLoginResult(result, res);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('temporarily locked')) {
        res.status(423).json({ error: { code: 'ACCOUNT_LOCKED', message } });
        return;
      }
      if (message.includes('selected role')) {
        res.status(403).json({ error: { code: 'ROLE_MISMATCH', message } });
        return;
      }
      if (message.includes('no assigned role') || message.includes('MFA is enabled')) {
        res.status(403).json({ error: { code: 'ACCOUNT_CONFIGURATION_ERROR', message } });
        return;
      }
      res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
    }
  });

  router.post('/mfa/verify', mfaLimiter, async (req, res) => {
    if (req.get('origin') && !isTrustedOrigin(req.get('origin'))) {
      res.status(403).json({ error: { code: 'INVALID_ORIGIN', message: 'Request origin is not allowed.' } });
      return;
    }
    const body = getRequestBody(req.body);
    if (typeof body?.challengeId !== 'string' || !validCode(body.code)) {
      res.status(400).json({ error: { code: 'INVALID_MFA_INPUT', message: 'Enter the six-digit authenticator code.' } });
      return;
    }
    try {
      const result = await auth.verifyMfaLogin(body.challengeId, body.code, metadata(req));
      res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);
      res.status(200).json({ accessToken: result.accessToken, expiresIn: result.expiresIn, user: result.user });
    } catch (error) {
      res.status(401).json({ error: { code: 'MFA_VERIFICATION_FAILED', message: error instanceof Error ? error.message : 'MFA verification failed.' } });
    }
  });

  router.post('/refresh', async (req, res) => {
    if (!isTrustedOrigin(req.get('origin'))) {
      res.status(403).json({ error: { code: 'INVALID_ORIGIN', message: 'Request origin is not allowed.' } });
      return;
    }
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (typeof refreshToken !== 'string') {
      res.status(401).json({ error: { code: 'REFRESH_TOKEN_MISSING', message: 'Please sign in again.' } });
      return;
    }
    try {
      const result = await auth.refresh(refreshToken, metadata(req));
      res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);
      res.status(200).json({ accessToken: result.accessToken, expiresIn: result.expiresIn, user: result.user });
    } catch {
      res.clearCookie(REFRESH_COOKIE, cookieOptions);
      res.status(401).json({ error: { code: 'REFRESH_FAILED', message: 'Your session has expired. Please sign in again.' } });
    }
  });

  router.post('/logout', requireAuth(auth), (req, res) => {
    if (!isTrustedOrigin(req.get('origin'))) {
      res.status(403).json({ error: { code: 'INVALID_ORIGIN', message: 'Request origin is not allowed.' } });
      return;
    }
    const sessionId = res.locals.sessionId as string;
    const user = res.locals.authUser as AuthenticatedUser;
    auth.logout(sessionId, user.id, metadata(req));
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    res.status(200).json({ message: 'Logged out successfully.' });
  });

  router.get('/me', requireAuth(auth), (_req, res) => {
    res.status(200).json({ user: res.locals.authUser });
  });

  router.post('/mfa/setup', requireAuth(auth), async (req, res) => {
    if (!isTrustedOrigin(req.get('origin'))) {
      res.status(403).json({ error: { code: 'INVALID_ORIGIN', message: 'Request origin is not allowed.' } });
      return;
    }
    const user = res.locals.authUser as AuthenticatedUser;
    try {
      const setup = await auth.beginMfaSetup(user.id, user.email, metadata(req));
      const qrCodeDataUrl = await QRCode.toDataURL(setup.otpauthUrl, { width: 220, margin: 1 });
      res.status(200).json({ ...setup, qrCodeDataUrl });
    } catch {
      res.status(500).json({ error: { code: 'MFA_SETUP_FAILED', message: 'Unable to start MFA setup.' } });
    }
  });

  router.post('/mfa/verify-setup', mfaLimiter, requireAuth(auth), async (req, res) => {
    if (!isTrustedOrigin(req.get('origin'))) {
      res.status(403).json({ error: { code: 'INVALID_ORIGIN', message: 'Request origin is not allowed.' } });
      return;
    }
    const body = getRequestBody(req.body);
    if (!validCode(body?.code)) {
      res.status(400).json({ error: { code: 'INVALID_MFA_INPUT', message: 'Enter the six-digit authenticator code.' } });
      return;
    }
    const user = res.locals.authUser as AuthenticatedUser;
    try {
      await auth.verifyMfaSetup(user.id, body.code, metadata(req));
      res.status(200).json({ message: 'Multi-factor authentication enabled.' });
    } catch (error) {
      res.status(400).json({ error: { code: 'MFA_SETUP_VERIFICATION_FAILED', message: error instanceof Error ? error.message : 'MFA setup verification failed.' } });
    }
  });

  router.get('/sessions', requireAuth(auth), (_req, res) => {
    const user = res.locals.authUser as AuthenticatedUser;
    const currentSessionId = res.locals.sessionId as string;
    res.status(200).json({
      sessions: auth.getSessions(user.id).map((session) => ({
        ...session,
        isCurrent: session.id === currentSessionId,
      })),
    });
  });

  router.post('/sessions/:id/revoke', requireAuth(auth), (req, res) => {
    if (!isTrustedOrigin(req.get('origin'))) {
      res.status(403).json({ error: { code: 'INVALID_ORIGIN', message: 'Request origin is not allowed.' } });
      return;
    }
    const user = res.locals.authUser as AuthenticatedUser;
    const currentSessionId = res.locals.sessionId as string;
    if (req.params.id === currentSessionId) {
      res.status(400).json({ error: { code: 'CURRENT_SESSION', message: 'Use Sign Out to end your current session.' } });
      return;
    }
    const sessionId = req.params.id;

if (!sessionId) {
  return res.status(400).json({ message: 'Session ID is required' });
}

if (!auth.revokeSession(sessionId, user.id, metadata(req))) {
      res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found.' } });
      return;
    }
    res.status(200).json({ message: 'Session revoked.' });
  });

  return router;
}
