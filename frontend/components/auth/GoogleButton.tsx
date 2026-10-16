'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function GoogleButton({ onError }: { onError: (msg: string) => void }) {
  const [loading, setLoading] = useState(false);

  const start = async () => {
    onError('');
    setLoading(true);
    try {
      localStorage.setItem('oauth_redirect_intent', 'google');
      // Return to the site root, the redirect URL Supabase already allows; AuthProvider finishes there.
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/`, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
      });
      if (error) throw error;
      if (!data?.url) throw new Error('Unable to start Google sign-in flow.');
      window.location.assign(data.url);
    } catch (err) {
      localStorage.removeItem('oauth_redirect_intent');
      onError((err as Error).message || 'Google login failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <button type="button" onClick={start} disabled={loading} className="btn-ghost w-full !bg-inset">
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-cream/30 border-t-cream" aria-label="Redirecting" /> : (
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
      )}
      Continue with Google
    </button>
  );
}
