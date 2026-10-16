'use client';

import { useState } from 'react';
import { fetchApi } from '@/lib/api';
import { isPersonalEmailAllowed, PERSONAL_EMAIL_ERROR } from '@/lib/personalEmail';
import { Field, FormError, SubmitButton } from './Field';

export default function SignUpForm({ onSuccess }: { onSuccess: (name: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Please enter your name.');
    if (!email.trim()) return setError('Please enter your email.');
    if (!isPersonalEmailAllowed(email)) { localStorage.removeItem('token'); return setError(PERSONAL_EMAIL_ERROR); }
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setError(''); setLoading(true);
    try {
      const data = await fetchApi<{ token: string }>('/auth/signup', { method: 'POST', body: { name, email, password } });
      localStorage.setItem('token', data.token);
      onSuccess(name.trim());
    } catch (err) {
      setError((err as Error).message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Full name" value={name} onChange={setName} autoComplete="name" />
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" placeholder="you@gmail.com" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="8+ characters" />
        <Field label="Confirm password" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
      </div>
      <FormError message={error} />
      <SubmitButton loading={loading}>Create account</SubmitButton>
    </form>
  );
}
