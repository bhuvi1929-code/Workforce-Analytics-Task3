import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import {
  loginRequest,
  logoutRequest,
  refreshSession,
  verifyMfaLogin,
  type AuthUser,
  type MfaLoginChallenge,
} from '../services/authClient';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, expectedRole: string) => Promise<MfaLoginChallenge | null>;
  verifyLoginMfa: (challengeId: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    refreshSession()
      .then((result) => { if (active) setUser(result.user); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const login = useCallback(async (email: string, password: string, expectedRole: string) => {
    const result = await loginRequest(email, password, expectedRole);
    if ('mfaRequired' in result) return result;
    setUser(result.user);
    return null;
  }, []);

  const verifyLoginMfa = useCallback(async (challengeId: string, code: string) => {
    const authenticatedUser = await verifyMfaLogin(challengeId, code);
    setUser(authenticatedUser);
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    window.location.hash = '#/login';
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyLoginMfa, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
