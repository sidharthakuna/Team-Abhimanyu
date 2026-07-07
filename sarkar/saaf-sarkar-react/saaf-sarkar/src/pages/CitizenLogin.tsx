import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPinned } from 'lucide-react';
import { EmailOtpForm } from '../components/EmailOtpForm';

export default function CitizenLogin() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col justify-center min-h-screen p-6 relative">
      <button className="back-link" onClick={() => navigate('/')}>
        <ArrowLeft size={15} strokeWidth={2.25} />
        Switch role
      </button>

      <div className="max-w-[380px] w-full mx-auto">
        <div className="auth-badge">
          <MapPinned size={22} strokeWidth={2} />
        </div>
        <div className="eyebrow mb-3">CITIZEN ACCESS</div>

        <h1 className="font-display text-[28px] mb-2">Verify to report</h1>
        <p className="text-[var(--text-muted)] text-sm mb-8">
          We verify your email before your report goes live, so every complaint on the map is
          tied to a real person.
        </p>

        <EmailOtpForm role="citizen" onSuccess={() => navigate('/citizen/report')} />
      </div>
    </div>
  );
}