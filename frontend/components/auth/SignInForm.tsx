'use client';

import { useState } from 'react';
import { fetchApi } from '@/lib/api';
import { isPersonalEmailAllowed, PERSONAL_EMAIL_ERROR } from '@/lib/personalEmail';
import { Field, FormError, SubmitButton } from './Field';

const deriveName = (email: string) => email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function SignInForm({ onSuccess, onForgot, initialError = '' }: {
  onSuccess: (name: string) => void; onForgot: () => void; initialError?: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return setError('Please enter your email.');
    if (!isPersonalEmailAllowed(email)) { localStorage.removeItem('token'); return setError(PERSONAL_EMAIL_ERROR); }
    if (!password.trim()) return setError('Please enter your password.');
    setError(''); setLoading(true);
    try {
      const data = await fetchApi<{ token: string; user?: { name?: string } }>('/auth/login', { method: 'POST', body: { email, password } });
      localStorage.setItem('token', data.token);
      onSuccess(data.user?.name || deriveName(email));
    } catch (err) {
      setError((err as Error).message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" placeholder="you@gmail.com" />
      <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
      <div className="flex justify-end">
        <button type="button" onClick={onForgot} className="text-[13px] text-gold hover:text-gold-bright">Forgot password?</button>
      </div>
      <FormError message={error} />
      <SubmitButton loading={loading}>Sign in</SubmitButton>
    </form>
  );
}
