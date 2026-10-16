'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import GoogleButton from '@/components/auth/GoogleButton';
import ResetPasswordForm from '@/components/auth/ResetPasswordForm';
import SignInForm from '@/components/auth/SignInForm';
import SignUpForm from '@/components/auth/SignUpForm';
import { FormError } from '@/components/auth/Field';
import { useAuth } from '@/components/app/AuthProvider';
import HeroScene from '@/components/hero/HeroScene';
import Logo from '@/components/ui/Logo';

type Mode = 'signin' | 'signup' | 'reset';

const TITLES: Record<Mode, [string, string]> = {
  signin: ['Welcome back.', 'Sign in to your policy workspace.'],
  signup: ['Create your account.', 'Upload a policy and ask your first question in a minute.'],
  reset: ['Reset your password.', 'Three quick steps and you’re back in.'],
};

export default function LoginPage() {
  const { authError, setAuthError, completeLogin } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [googleError, setGoogleError] = useState('');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read ?mode= once (static export, no server search params)
    if (new URLSearchParams(window.location.search).get('mode') === 'signup') setMode('signup');
  }, []);

  const switchMode = (m: Mode) => { setMode(m); setAuthError(''); setGoogleError(''); };

  return (
    <div className="relative isolate grid min-h-[100svh] lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden lg:block" aria-hidden>
        <HeroScene />
        <div className="relative z-10 flex h-full flex-col justify-end p-14">
          <p className="font-mono text-[12px] uppercase tracking-[0.3em] text-gold">Policy documents, made simple</p>
          <p className="mt-4 max-w-md font-display text-5xl font-semibold leading-[1] text-cream">Complex policies,<br /><span className="text-gold-grad">clear answers.</span></p>
        </div>
      </aside>

      <main className="relative flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="PolicyLens home"><Logo /></Link>
          <Link href="/" className="flex items-center gap-1.5 text-[13px] text-muted hover:text-cream"><ArrowLeft size={14} aria-hidden /> Home</Link>
        </div>

        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-10">
          <AnimatePresence mode="wait">
            <motion.div key={mode} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
              <h1 className="font-display text-[2.6rem] font-semibold leading-none text-cream">{TITLES[mode][0]}</h1>
              <p className="mt-3 text-[15px] text-muted">{TITLES[mode][1]}</p>

              <div className="glass mt-8 rounded-3xl p-6 sm:p-7">
                {mode !== 'reset' && (
                  <>
                    <GoogleButton onError={setGoogleError} />
                    <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
                    <div className="mb-4 empty:hidden"><FormError message={googleError} /></div>
                  </>
                )}
                {mode === 'signin' && <SignInForm key={authError} initialError={authError} onSuccess={completeLogin} onForgot={() => switchMode('reset')} />}
                {mode === 'signup' && <SignUpForm onSuccess={completeLogin} />}
                {mode === 'reset' && <ResetPasswordForm onDone={() => switchMode('signin')} />}
              </div>

              <p className="mt-6 text-center text-[14px] text-muted">
                {mode === 'signin' && <>New to PolicyLens? <button onClick={() => switchMode('signup')} className="text-gold hover:text-gold-bright">Create an account</button></>}
                {mode === 'signup' && <>Already have an account? <button onClick={() => switchMode('signin')} className="text-gold hover:text-gold-bright">Sign in</button></>}
                {mode === 'reset' && <button onClick={() => switchMode('signin')} className="text-gold hover:text-gold-bright">Back to sign in</button>}
              </p>
              <p className="mt-3 text-center text-[12px] text-muted/70">Personal email accounts only (Gmail, Outlook, iCloud…).</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
