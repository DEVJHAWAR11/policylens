'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Menu, X } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { scrollToId } from '@/hooks/useLenis';

const LINKS = [
  { id: 'features', label: 'Features' },
  { id: 'how', label: 'How it works' },
  { id: 'use-cases', label: 'Use cases' },
  { id: 'under-the-hood', label: 'Documentation' },
  { id: 'faq', label: 'FAQ' },
];

export default function Navbar({ signedIn }: { signedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  const go = (id: string) => { setOpen(false); scrollToId(id); };

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${scrolled ? 'border-b border-line bg-bg/70 backdrop-blur-xl' : 'border-b border-transparent'}`}>
      <nav className="mx-auto flex h-[72px] max-w-[1320px] items-center gap-8 px-4 sm:px-8" aria-label="Main">
        <Link href="/" aria-label="PolicyLens home"><Logo /></Link>
        <ul className="ml-6 hidden items-center gap-7 text-[14px] text-cream/85 lg:flex">
          {LINKS.map((l) => (
            <li key={l.id}><button onClick={() => go(l.id)} className="transition-colors hover:text-gold-bright">{l.label}</button></li>
          ))}
        </ul>
        <ThemeToggle className="ml-auto" />
        <div className="hidden items-center gap-3 sm:flex">
          {signedIn ? (
            <Link href="/app/" className="btn-gold !py-2.5 text-sm">Open workspace <ArrowRight size={15} aria-hidden /></Link>
          ) : (
            <>
              <Link href="/login/" className="btn-ghost !py-2.5 text-sm">Sign in</Link>
              <Link href="/login/?mode=signup" className="btn-gold !py-2.5 text-sm">Get Started <ArrowRight size={15} aria-hidden /></Link>
            </>
          )}
        </div>
        <button className="rounded-md p-2 text-cream lg:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden border-t border-line bg-bg/95 backdrop-blur-xl lg:hidden">
            <ul className="flex flex-col gap-1 px-4 py-4">
              {LINKS.map((l) => (
                <li key={l.id}><button onClick={() => go(l.id)} className="w-full rounded-lg px-3 py-3 text-left text-cream/90 hover:bg-tint">{l.label}</button></li>
              ))}
              <li className="mt-2 flex gap-3 px-3 sm:hidden">
                {signedIn ? <Link href="/app/" className="btn-gold flex-1">Open workspace</Link> : (
                  <><Link href="/login/" className="btn-ghost flex-1">Sign in</Link><Link href="/login/?mode=signup" className="btn-gold flex-1">Get Started</Link></>
                )}
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
