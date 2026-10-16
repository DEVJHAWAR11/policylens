'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { fetchApi } from '@/lib/api';
import { Field, FormError, SubmitButton } from './Field';

type Step = 'email' | 'code' | 'reset' | 'done';

// forgot-password → verify-reset-code → reset-password (same endpoints as before)
export default function ResetPasswordForm({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setError(''); setLoading(true);
    try { await fn(); } catch (err) { setError((err as Error).message || fallback); } finally { setLoading(false); }
  };

  const sendCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return setError('Please enter your email.');
    run(async () => {
      await fetchApi('/auth/forgot-password', { method: 'POST', body: { email: email.trim() } });
      setStep('code');
    }, 'Failed to send reset code. Please try again.');
  };

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) return setError('Enter the 6-digit code sent to your email.');
    run(async () => {
      const data = await fetchApi<{ resetToken: string }>('/auth/verify-reset-code', { method: 'POST', body: { email: email.trim(), code } });
      setResetToken(data.resetToken);
      setStep('reset');
    }, 'Invalid or expired code. Please try again.');
  };

  const reset = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setError('Password must be at least 8 characters.');
    if (pw !== confirm) return setError('Passwords do not match.');
    run(async () => {
      await fetchApi('/auth/reset-password', { method: 'POST', body: { resetToken, password: pw } });
      setStep('done');
      setTimeout(onDone, 2200);
    }, 'Failed to reset password. Please try again.');
  };

  const stepIdx = { email: 0, code: 1, reset: 2, done: 3 }[step];

  return (
    <div>
      <div className="mb-6 flex gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i < stepIdx || step === 'done' ? 'bg-gold' : i === stepIdx ? 'bg-gold/50' : 'bg-tint-strong'}`} />)}
      </div>
      {step === 'email' && (
        <form onSubmit={sendCode} className="space-y-4" noValidate>
          <p className="text-[14px] text-muted">We’ll email you a 6-digit code.</p>
          <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" autoFocus />
          <FormError message={error} />
          <SubmitButton loading={loading}>Send code</SubmitButton>
        </form>
      )}
      {step === 'code' && (
        <form onSubmit={verify} className="space-y-4" noValidate>
          <p className="text-[14px] text-muted">Enter the code sent to <span className="text-cream">{email}</span>.</p>
          <Field label="Verification code" value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} autoComplete="one-time-code" autoFocus />
          <FormError message={error} />
          <SubmitButton loading={loading}>Verify</SubmitButton>
        </form>
      )}
      {step === 'reset' && (
        <form onSubmit={reset} className="space-y-4" noValidate>
          <Field label="New password" type="password" value={pw} onChange={setPw} autoComplete="new-password" autoFocus />
          <Field label="Confirm password" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          <FormError message={error} />
          <SubmitButton loading={loading}>Update password</SubmitButton>
        </form>
      )}
      {step === 'done' && (
        <p role="status" className="flex items-center gap-3 rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-[14px] text-ok-ink">
          <CheckCircle2 size={18} aria-hidden /> Password updated. Taking you back to sign in…
        </p>
      )}
    </div>
  );
}
