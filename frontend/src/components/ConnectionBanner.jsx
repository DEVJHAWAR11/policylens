import { useEffect, useState } from 'react';

// Tells the user when the browser is offline, and briefly confirms when it's back.
export default function ConnectionBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [justRestored, setJustRestored] = useState(false);

  useEffect(() => {
    let timer;
    const goOffline = () => { clearTimeout(timer); setJustRestored(false); setOnline(false); };
    const goOnline = () => {
      setOnline(true);
      setJustRestored(true);
      timer = setTimeout(() => setJustRestored(false), 3000);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (online && !justRestored) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000,
        padding: '8px 16px', textAlign: 'center', fontSize: 13, fontWeight: 500,
        fontFamily: "'DM Sans', sans-serif",
        background: online ? '#059669' : '#b45309', color: '#fff',
      }}
    >
      {online
        ? "Back online — we'll pick up where we left off."
        : "You're offline. Uploads and answers will resume when your connection returns."}
    </div>
  );
}
