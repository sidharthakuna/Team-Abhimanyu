import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Building2, ChevronRight, User, Wind } from 'lucide-react';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from '../components/ThemeToggle';

export default function Landing() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  // Fresh visit to the root always clears any prior verification —
  // mirrors the original clearSession() behavior, now against the
  // token-based AuthContext instead of the old phone-based session.
  useEffect(() => {
    logout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen p-6 relative">
      <ThemeToggle className="absolute top-6 right-6" />

      <div className="w-full max-w-[420px]">
        <div className="landing-mark">
          <Wind size={30} strokeWidth={2} />
        </div>

        <div className="eyebrow mb-2">SMART CIVIC REPORTING</div>

        <h1 className="font-display text-[34px] mb-3">Saaf Sarkar</h1>

        <p className="text-[var(--text-muted)] mb-10 leading-relaxed">
          Report pollution hotspots, track live air quality, and help your city respond before
          it spreads.
        </p>

        <Card interactive className="mb-4 role-card" onClick={() => navigate('/citizen/login')}>
          <div className="flex gap-4 items-center">
            <div className="role-icon">
              <User size={24} strokeWidth={2} />
            </div>
            <div className="flex-1">
              <div className="text-[18px] font-bold">Citizen</div>
              <div className="text-[13px] text-[var(--text-muted)] mt-1">
                Report garbage, pollution, or sewage and track your complaint's status.
              </div>
            </div>
            <ChevronRight size={18} className="role-chevron" />
          </div>
        </Card>

        <Card interactive className="mb-4 role-card" onClick={() => navigate('/municipal/login')}>
          <div className="flex gap-4 items-center">
            <div className="role-icon">
              <Building2 size={24} strokeWidth={2} />
            </div>
            <div className="flex-1">
              <div className="text-[18px] font-bold">Municipal officer</div>
              <div className="text-[13px] text-[var(--text-muted)] mt-1">
                Review the triage queue, assign work, and verify completed cleanups.
              </div>
            </div>
            <ChevronRight size={18} className="role-chevron" />
          </div>
        </Card>

        <div className="text-center mt-8 text-xs text-[var(--text-dim)]">
          Version 2 · Smart Civic Platform
        </div>
      </div>
    </div>
  );
}