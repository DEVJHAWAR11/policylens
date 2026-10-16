'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Wifi, WifiOff } from 'lucide-react';

// Tells the user when the browser is offline, and briefly confirms when it's back.
export default function ConnectionBanner() {
  const [online, setOnline] = useState(true);
  const [justRestored, setJustRestored] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- navigator is browser-only
    setOnline(navigator.onLine);
    let timer: ReturnType<typeof setTimeout>;
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

  const show = !online || justRestored;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className={`fixed inset-x-0 top-0 z-[80] flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium ${
            online ? 'bg-[#2f4a2c] text-[#e6f4e2]' : 'bg-[#5a3a17] text-[#fbe9cf]'
          }`}
        >
          {online ? <Wifi size={15} aria-hidden /> : <WifiOff size={15} aria-hidden />}
          {online
            ? "Back online — we'll pick up where we left off."
            : "You're offline. Uploads and answers will resume when your connection returns."}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
