import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/Button';
import { API, ApiError } from '../api/client';

type Step = 'phone' | 'otp';

export default function CitizenLogin() {
  const navigate = useNavigate();
  const { session, setSession } = useSession();
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  async function sendCode() {
    if (phone.trim().length < 10) {
      showToast('Enter a valid 10-digit number 📵');
      return;
    }
    setSending(true);
    try {
      const result = await API.sendOtp(phone.trim());
      if (result.status === 'simulated') {
        showToast('Demo mode: use code 123456 🔑');
      } else {
        showToast('OTP sent to your phone 📩');
      }
      setStep('otp');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not send OTP';
      showToast(msg);
    } finally {
      setSending(false);
    }
  }

  async function verifyCode() {
    if (otp.trim().length < 4) {
      showToast('Enter the code you received 🔢');
      return;
    }
    setVerifying(true);
    try {
      const result = await API.verifyOtp(phone.trim(), otp.trim());
      if (result.status === 'approved') {
        setSession({ ...session, role: 'citizen', phoneNumber: phone.trim() });
        showToast('Verified ✅');
        navigate('/citizen/report');
      } else {
        showToast('Verification did not succeed — try again');
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Invalid or expired code';
      showToast(msg);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="flex flex-col justify-center min-h-screen p-6 relative">
      <button
        className="absolute top-6 left-6 text-[var(--text-muted)] text-sm flex items-center gap-1 bg-transparent border-none cursor-pointer"
        onClick={() => navigate('/')}
      >
        ← switch role
      </button>

      <div className="max-w-[380px] w-full mx-auto">
        <div className="eyebrow mb-2">STEP {step === 'phone' ? '1' : '2'} OF 2</div>

        {step === 'phone' ? (
          <>
            <h1 className="font-display text-[28px] mb-2">
              Where should we
              <br />
              send updates?
            </h1>
            <p className="text-[var(--text-muted)] text-sm mb-10">
              We'll text you when your report gets picked up and when it's resolved. 📲
            </p>

            <div className="mb-6">
              <label className="text-[13px] font-semibold text-[var(--text-muted)] mb-2 block">
                Phone number
              </label>
              <div className="flex gap-2">
                <div className="w-[60px] flex-shrink-0 text-center font-mono text-[var(--text-muted)] flex items-center justify-center">
                  +91
                </div>
                <input
                  type="tel"
                  placeholder="98765 43210"
                  maxLength={10}
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && sendCode()}
                  className="flex-1 rounded-2xl px-4 py-3.5 text-[15px] outline-none"
                  style={{
                    background: 'var(--bg-surface-raised)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <p className="text-xs text-[var(--text-dim)] mt-2">
                We'll send a one-time code to verify this number. 🔒
              </p>
            </div>

            <Button full onClick={sendCode} disabled={sending}>
              {sending ? <span className="spinner" /> : 'Send verification code'}
            </Button>
          </>
        ) : (
          <>
            <h1 className="font-display text-[28px] mb-2">Enter the code</h1>
            <p className="text-[var(--text-muted)] text-sm mb-10">
              We sent a code to +91 {phone}.{' '}
              <button
                className="underline bg-transparent border-none cursor-pointer p-0"
                style={{ color: 'var(--accent-live)' }}
                onClick={() => setStep('phone')}
              >
                Change number
              </button>
            </p>

            <div className="mb-6">
              <label className="text-[13px] font-semibold text-[var(--text-muted)] mb-2 block">
                Verification code
              </label>
              <input
                type="text"
                placeholder="123456"
                maxLength={6}
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && verifyCode()}
                className="w-full rounded-2xl px-4 py-3.5 text-[15px] outline-none font-mono tracking-[0.3em] text-center"
                style={{
                  background: 'var(--bg-surface-raised)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <Button full onClick={verifyCode} disabled={verifying}>
              {verifying ? <span className="spinner" /> : 'Verify & continue'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
