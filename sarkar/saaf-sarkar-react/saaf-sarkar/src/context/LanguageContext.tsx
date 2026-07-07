import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'saaf_sarkar_lang';

// UI-ONLY STUB: this stores and persists a language selection and gives
// you a working dropdown, but nothing in the app actually reads `lang`
// to swap any displayed strings yet. That's deliberate — wiring real
// translations (a dictionary + a t() lookup used throughout the JSX) is
// a separate pass you said you'd do yourself. Selecting "Hindi" here
// right now will persist the choice across reloads, but the UI text
// will stay in English until that follow-up work is done.
export type Language = 'en' | 'hi';

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  hi: 'हिंदी',
};

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function readStoredLang(): Language | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'en' || raw === 'hi' ? raw : null;
  } catch {
    return null;
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => readStoredLang() ?? 'en');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* storage unavailable — selection just won't persist across reloads */
    }
  }, [lang]);

  const setLang = (next: Language) => setLangState(next);

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}