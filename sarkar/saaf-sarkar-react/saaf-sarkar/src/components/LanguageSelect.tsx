import { Languages } from 'lucide-react';
import { useLanguage, LANGUAGE_LABELS, type Language } from '../context/LanguageContext';

// Matches the visual language of ThemeToggle.tsx / .chip-btn from
// components.css — a pill button, no new CSS file needed. This is the
// dropdown only; see LanguageContext.tsx's top comment for what's
// intentionally NOT wired up yet (actual string translation).
export function LanguageSelect({ className = '' }: { className?: string }) {
  const { lang, setLang } = useLanguage();

  return (
    <div className={`chip-btn ${className}`} style={{ paddingRight: 6, cursor: 'default' }}>
      <Languages size={14} strokeWidth={2.25} />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Language)}
        aria-label="Choose language"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {(Object.keys(LANGUAGE_LABELS) as Language[]).map((code) => (
          <option key={code} value={code} style={{ color: '#0b0f0d' }}>
            {LANGUAGE_LABELS[code]}
          </option>
        ))}
      </select>
    </div>
  );
}