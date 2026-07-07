import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { SessionData } from '../types';

const STORAGE_KEY = 'saaf_sarkar_session';

interface SessionContextValue {
  session: SessionData | null;
  setSession: (data: SessionData) => void;
  clearSession: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

function readStoredSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<SessionData | null>(readStoredSession);

  useEffect(() => {
    if (session) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      } catch {
        /* storage unavailable — session just won't persist across reloads */
      }
    }
  }, [session]);

  const setSession = (data: SessionData) => setSessionState(data);

  const clearSession = () => {
    setSessionState(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <SessionContext.Provider value={{ session, setSession, clearSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
