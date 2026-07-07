import { useState } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { API, ApiError } from '../api/client';
import { buildAuthSession, useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button } from './Button';
import type { UserRole } from '../types';

type Step = 'email' | 'otp';

interface EmailOtpFormProps {
  role: UserRole;
  onSuccess: () => void;
  department?: string | null;
}

// Shared by CitizenLogin and MunicipalLogin — the backend has exactly one
// verification path (email OTP or Google) regardless of role; role is a
// purely client-side label attached to the resulting AuthSession, since
// auth.py's token itself carries no role/permission data (see auth.py's
// create_verification_token docstring).
export function EmailOtpForm({ role, onSuccess, department = null }: EmailOtpFormProps) {
  const { login } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  async function sendCode() {
    if (!isValidEmail(email)) {
      showToast('Enter a valid email address', 'error');
      return;
    }
    setSending(true);
    try {
      const result = await API.sendOtp(email.trim());
      if (result.status === 'simulated') {
        showToast('Demo mode active — use code 123456', 'default');
      } else {
        showToast('Verification code sent to your inbox', 'success');
      }
      setStep('otp');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not send the code';
      showToast(msg, 'error');
    } finally {
      setSending(false);
    }
  }

  async function verifyCode() {
    if (code.trim().length < 4) {
      showToast('Enter the code you received', 'error');
      return;
    }
    setVerifying(true);
    try {
      const result = await API.verifyOtp(email.trim(), code.trim());
      login(
        buildAuthSession({
          token: result.verification_token,
          email: email.trim().toLowerCase(),
          role,
          expiresInMinutes: result.expires_in_minutes,
          department,
        }),
      );
      showToast('Verified', 'success');
      onSuccess();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Invalid or expired code';
      showToast(msg, 'error');
    } finally {
      setVerifying(false);
    }
  }

  async function handleGoogleSuccess(credential: CredentialResponse) {
    if (!credential.credential) {
      showToast('Google sign-in did not return a token', 'error');
      return;
    }
    try {
      const result = await API.googleLogin(credential.credential);
      login(
        buildAuthSession({
          token: result.verification_token,
          email: result.email,
          role,
          expiresInMinutes: result.expires_in_minutes,
          name: result.name,
          picture: result.picture,
          department,
        }),
      );
      showToast(`Signed in as ${result.name || result.email}`, 'success');
      onSuccess();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Google sign-in failed';
      showToast(msg, 'error');
    }
  }

  return (
    <div>
      {step === 'email' ? (
        <>
          <label className="form-label">
            <Mail size={13} strokeWidth={2.25} />
            Email address
          </label>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendCode()}
            className="form-input"
            autoComplete="email"
          />
          <p className="form-hint">We'll send a one-time code to verify this address.</p>

          <Button full onClick={sendCode} loading={sending} className="mt-1">
            Send verification code
          </Button>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <div className="google-btn-wrap">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => showToast('Google sign-in failed', 'error')}
              theme="filled_black"
              shape="pill"
              width="320"
            />
          </div>
        </>
      ) : (
        <>
          <label className="form-label">
            <KeyRound size={13} strokeWidth={2.25} />
            Verification code
          </label>
          <input
            type="text"
            placeholder="123456"
            maxLength={6}
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && verifyCode()}
            className="form-input form-input--code"
          />
          <p className="form-hint">
            Sent to {email}.{' '}
            <button className="form-link" onClick={() => setStep('email')}>
              Change address
            </button>
          </p>

          <Button full onClick={verifyCode} loading={verifying} className="mt-1">
            <ShieldCheck size={17} strokeWidth={2.25} />
            Verify &amp; continue
          </Button>
        </>
      )}
    </div>
  );
}