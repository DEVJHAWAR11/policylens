'use client';

import { useEffect, useRef } from 'react';
import { gsap, useIsDesktop, useReducedMotion } from '@/hooks/useGsap';

// Small gold ring that trails the pointer and grows over anything interactive. Desktop only.
export default function CustomCursor() {
  const ring = useRef<HTMLDivElement>(null);
  const desktop = useIsDesktop();
  const reduced = useReducedMotion();
  const active = desktop && !reduced;

  useEffect(() => {
    const el = ring.current;
    if (!active || !el) return;
    const xTo = gsap.quickTo(el, 'x', { duration: 0.35, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.35, ease: 'power3.out' });
    let hovering = false;
    const move = (e: PointerEvent) => {
      xTo(e.clientX); yTo(e.clientY);
      const hit = (e.target as Element)?.closest?.('a,button,[role="tab"],input,textarea,label,summary,[data-cursor]');
      if (Boolean(hit) !== hovering) {
        hovering = Boolean(hit);
        gsap.to(el, { scale: hovering ? 2.2 : 1, opacity: hovering ? 0.55 : 0.9, duration: 0.4, ease: 'power3.out' });
      }
    };
    const leave = () => gsap.to(el, { opacity: 0, duration: 0.2 });
    const enter = () => gsap.to(el, { opacity: 0.9, duration: 0.2 });
    window.addEventListener('pointermove', move);
    document.addEventListener('pointerleave', leave);
    document.addEventListener('pointerenter', enter);
    return () => {
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', leave);
      document.removeEventListener('pointerenter', enter);
    };
  }, [active]);

  if (!active) return null;
  return (
    <div
      ref={ring}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[90] -ml-[9px] -mt-[9px] h-[18px] w-[18px] rounded-full border border-gold-bright opacity-0 mix-blend-screen"
    />
  );
}
