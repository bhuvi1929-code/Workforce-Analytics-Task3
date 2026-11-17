const BASE = import.meta.env.VITE_API_BASE ?? '/api';

export interface AuthUser {
  id: number;
  employeeId: number | null;
  departmentId: number | null;
  email: string;
  fullName: string;
  mfaEnabled: boolean;
  roles: string[];
  permissions: string[];
}

interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface MfaLoginChallenge {
  mfaRequired: true;
  challengeId: string;
  expiresIn: number;
}

export type LoginResponse = AuthResponse | MfaLoginChallenge;

export interface MfaSetupResponse {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export interface SessionInfo {
  id: string;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  isCurrent: boolean;
}

let accessToken: string | null = null;
let refreshPromise: Promise<AuthResponse> | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function clearAccessToken(): void {
  accessToken = null;
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message ?? body?.message ?? `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

async function authenticatedRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return readResponse<T>(response);
}

export async function loginRequest(
  email: string,
  password: string,
  expectedRole: string,
): Promise<LoginResponse> {
  const response = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password, expectedRole }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) {
    const message = body?.error?.message ?? `Request failed (${response.status})`;
    throw new Error(message);
  }
  if (response.status === 202 || body?.mfaRequired === true) {
    return body as MfaLoginChallenge;
  }
  const result = body as AuthResponse;
  accessToken = result.accessToken;
  return result;
}

export async function verifyMfaLogin(challengeId: string, code: string): Promise<AuthUser> {
  const response = await fetch(`${BASE}/auth/mfa/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ challengeId, code }),
  });
  const result = await readResponse<AuthResponse>(response);
  accessToken = result.accessToken;
  return result.user;
}

export function refreshSession(): Promise<AuthResponse> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const response = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const result = await readResponse<AuthResponse>(response);
    accessToken = result.accessToken;
    return result;
  })();
  return refreshPromise.finally(() => { refreshPromise = null; });
}

export async function logoutRequest(): Promise<void> {
  const token = accessToken;
  try {
    await fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } finally {
    accessToken = null;
  }
}

export function startMfaSetup(): Promise<MfaSetupResponse> {
  return authenticatedRequest('/auth/mfa/setup', 'POST', {});
}

export function verifyMfaSetup(code: string): Promise<{ message: string }> {
  return authenticatedRequest('/auth/mfa/verify-setup', 'POST', { code });
}

export function getSessions(): Promise<{ sessions: SessionInfo[] }> {
  return authenticatedRequest('/auth/sessions');
}

export function revokeSession(sessionId: string): Promise<{ message: string }> {
  return authenticatedRequest(`/auth/sessions/${encodeURIComponent(sessionId)}/revoke`, 'POST', {});
}
