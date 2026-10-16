'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { currentTheme, switchTheme, THEME_EVENT, THEME_KEY, type Theme } from '@/lib/theme';

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    setTheme(currentTheme()); // eslint-disable-line react-hooks/set-state-in-effect -- set by the head script before hydration
    const onChange = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener(THEME_EVENT, onChange);
    // follow the OS while the user hasn't picked a theme themselves
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onOs = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
      if (!saved) switchTheme(mq.matches ? 'light' : 'dark');
    };
    mq.addEventListener('change', onOs);
    return () => { window.removeEventListener(THEME_EVENT, onChange); mq.removeEventListener('change', onOs); };
  }, []);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        switchTheme(next, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={`relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-line text-gold transition-colors hover:border-gold hover:text-gold-bright ${className}`}
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={theme}
          initial={{ y: 14, opacity: 0, rotate: -40 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -14, opacity: 0, rotate: 40 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="grid place-items-center"
        >
          {theme === 'dark' ? <Moon size={17} aria-hidden /> : <Sun size={17} aria-hidden />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
