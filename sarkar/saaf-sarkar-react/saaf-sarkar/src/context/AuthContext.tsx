import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthSession, UserRole } from '../types';

// Deliberately a different key from any old phone-based session storage —
// the shape changed (token + email, not phone), so reusing the old key
// would let a stale phone-based blob get parsed as if it were a token.
const STORAGE_KEY = 'saaf_sarkar_auth_v2';

interface AuthContextValue {
  session: AuthSession | null;
  isAuthenticated: boolean;
  // true once we've checked localStorage on mount — lets pages avoid a
  // flash-redirect to /login before we've had a chance to read a valid
  // persisted token.
  hydrated: boolean;
  login: (session: AuthSession) => void;
  logout: () => void;
  // Convenience header object for authenticated fetches. Empty object if
  // not logged in — callers should still handle a resulting 401.
  authHeader: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed.token || !parsed.expiresAt) return null;
    if (Date.now() >= parsed.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSession(readStoredSession());
    setHydrated(true);
  }, []);

  // Passive expiry check — if the token's 2-hour (or configured) window
  // lapses while the tab is open, clear it so the UI reflects "please
  // re-verify" rather than silently 401-ing on the next report submit.
  useEffect(() => {
    if (!session) return;
    const msUntilExpiry = session.expiresAt - Date.now();
    if (msUntilExpiry <= 0) {
      logout();
      return;
    }
    const timer = window.setTimeout(() => logout(), msUntilExpiry);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  function login(next: AuthSession) {
    setSession(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable (private browsing etc.) — session still
         works for this tab via React state, just won't survive reload */
    }
  }

  function logout() {
    setSession(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  function authHeader(): Record<string, string> {
    return session ? { Authorization: `Bearer ${session.token}` } : {};
  }

  const value = useMemo(
    () => ({ session, isAuthenticated: !!session, hydrated, login, logout, authHeader }),
    [session, hydrated],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

// Small helper used by login pages to build the persisted session object
// consistently from either the OTP or Google response shape.
export function buildAuthSession(params: {
  token: string;
  email: string;
  role: UserRole;
  expiresInMinutes: number;
  name?: string;
  picture?: string;
  department?: string | null;
}): AuthSession {
  return {
    token: params.token,
    email: params.email,
    role: params.role,
    expiresAt: Date.now() + params.expiresInMinutes * 60_000,
    name: params.name,
    picture: params.picture,
    department: params.department ?? null,
  };
}