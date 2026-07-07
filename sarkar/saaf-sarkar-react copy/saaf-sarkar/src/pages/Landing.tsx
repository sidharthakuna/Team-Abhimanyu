import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Card } from '../components/Card';
import { useSession } from '../context/SessionContext';
import { ThemeToggle } from '../components/ThemeToggle';

export default function Landing() {
  const navigate = useNavigate();
  const { clearSession, setSession } = useSession();

  // Fresh visit to the root always clears any prior role choice — matches
  // Session.clear() in the original index.html.
  useEffect(() => {
    clearSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCitizen() {
    setSession({ role: 'citizen' });
    navigate('/citizen/login');
  }

  function openMunicipal() {
    setSession({ role: 'municipal' });
    navigate('/municipal/login');
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-6 relative">
      <ThemeToggle className="absolute top-6 right-6" />

      <div className="w-full max-w-[420px]">
        <div
          className="w-[72px] h-[72px] rounded-[20px] flex items-center justify-center text-[34px] mb-6"
          style={{ background: 'var(--accent-live)' }}
        >
          🧹
        </div>

        <div className="eyebrow mb-2">SMART CIVIC REPORTING</div>

        <h1 className="font-display text-[34px] mb-3">Saaf Sarkar</h1>

        <p className="text-[var(--text-muted)] mb-10 leading-relaxed">
          Report pollution issues, track complaints and help your city stay clean. 🌿
        </p>

        <Card
          interactive
          className="mb-4 hover:border-[var(--accent-live)]"
          onClick={openCitizen}
        >
          <div className="flex gap-4 items-center">
            <div
              className="w-[54px] h-[54px] rounded-[14px] flex items-center justify-center text-2xl flex-shrink-0"
              style={{ background: 'var(--bg-surface-raised)' }}
            >
              👤
            </div>
            <div>
              <div className="text-[18px] font-bold">Citizen</div>
              <div className="text-[13px] text-[var(--text-muted)] mt-1">
                Report garbage, pollution, sewage and track complaint status. 📸
              </div>
            </div>
          </div>
        </Card>

        <Card
          interactive
          className="mb-4 hover:border-[var(--accent-live)]"
          onClick={openMunicipal}
        >
          <div className="flex gap-4 items-center">
            <div
              className="w-[54px] h-[54px] rounded-[14px] flex items-center justify-center text-2xl flex-shrink-0"
              style={{ background: 'var(--bg-surface-raised)' }}
            >
              🏛️
            </div>
            <div>
              <div className="text-[18px] font-bold">Municipal Officer</div>
              <div className="text-[13px] text-[var(--text-muted)] mt-1">
                Review reports, assign work, verify completion and manage the queue. 🚧
              </div>
            </div>
          </div>
        </Card>

        <div className="text-center mt-8 text-xs text-[var(--text-dim)]">
          Version 2 • Smart Civic Platform
        </div>
      </div>
    </div>
  );
}