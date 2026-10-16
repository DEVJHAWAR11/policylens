'use client';

// Small, dependency-free takes on the React Bits pieces the design calls for:
// SplitText (masked line reveal), CountUp, SpotlightCard, Magnet and Tilt.

import { useEffect, useRef, useState } from 'react';
import { gsap, ScrollTrigger, useReducedMotion } from '@/hooks/useGsap';

/* ── SplitText: each line rises out of a mask and sharpens from blur ───────── */
export function SplitLines({
  lines,
  className = '',
  lineClassName = '',
  delay = 0,
  as: Tag = 'h1',
  play = true,
}: {
  lines: React.ReactNode[];
  className?: string;
  lineClassName?: ((i: number) => string) | string;
  delay?: number;
  as?: 'h1' | 'h2' | 'h3' | 'p';
  play?: boolean;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!ref.current || !play) return;
    const inner = ref.current.querySelectorAll<HTMLElement>('[data-line]');
    if (reduced) { gsap.set(inner, { yPercent: 0, opacity: 1, filter: 'none' }); return; }
    const tl = gsap.fromTo(inner,
      { yPercent: 110, opacity: 0, filter: 'blur(10px)' },
      { yPercent: 0, opacity: 1, filter: 'blur(0px)', duration: 1.3, ease: 'expo.out', stagger: 0.12, delay });
    return () => { tl.kill(); };
  }, [play, reduced, delay]);
  const lc = (i: number) => (typeof lineClassName === 'function' ? lineClassName(i) : lineClassName);
  return (
    <Tag ref={ref} className={className}>
      {lines.map((line, i) => (
        <span key={i} className="block overflow-hidden pb-[0.08em]">
          <span data-line className={`block will-change-transform ${lc(i)}`} style={{ opacity: 0 }}>{line}</span>
        </span>
      ))}
    </Tag>
  );
}

/* ── CountUp: counts when scrolled into view ─────────────────────────────── */
export function CountUp({ to, duration = 1.8, className = '' }: { to: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!ref.current) return;
    if (reduced) return;
    const obj = { v: 0 };
    const st = ScrollTrigger.create({
      trigger: ref.current,
      start: 'top bottom',
      once: true,
      onEnter: () => gsap.to(obj, { v: to, duration, ease: 'power3.out', onUpdate: () => setValue(Math.round(obj.v)) }),
    });
    return () => st.kill();
  }, [to, duration, reduced]);
  return <span ref={ref} className={className}>{reduced ? to : value}</span>;
}

/* ── SpotlightCard: a gold glow follows the cursor ───────────────────────── */
export function SpotlightCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    ref.current!.style.setProperty('--sx', `${e.clientX - r.left}px`);
    ref.current!.style.setProperty('--sy', `${e.clientY - r.top}px`);
  };
  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className={`group relative overflow-hidden rounded-3xl border border-line bg-raised/70 ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: 'radial-gradient(420px circle at var(--sx, 50%) var(--sy, 50%), rgba(217,174,107,0.16), transparent 60%)' }}
      />
      <div className="relative h-full">{children}</div>
    </div>
  );
}

/* ── Magnet: pulls its child toward the cursor ───────────────────────────── */
export function Magnet({ children, strength = 0.3, className = '' }: { children: React.ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || !window.matchMedia('(pointer: fine)').matches) return;
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' });
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < Math.max(r.width, r.height) * 1.1) { xTo(dx * strength); yTo(dy * strength); }
      else { xTo(0); yTo(0); }
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [strength, reduced]);
  return <div ref={ref} className={`inline-block ${className}`}>{children}</div>;
}

/* ── Tilt: 3D tilt toward the cursor, on top of a resting rotation ───────── */
export function Tilt({
  children, className = '', max = 6, base = { rx: 4, ry: -8, rz: 0 }, enabled = true, onHoverChange,
}: {
  children: React.ReactNode; className?: string; max?: number;
  base?: { rx: number; ry: number; rz: number }; enabled?: boolean; onHoverChange?: (hover: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    gsap.set(el, { rotateX: enabled ? base.rx : 0, rotateY: enabled ? base.ry : 0, rotateZ: enabled ? base.rz : 0, transformPerspective: 1400 });
  }, [enabled, base.rx, base.ry, base.rz]);
  const onMove = (e: React.PointerEvent) => {
    if (!enabled) return;
    const r = ref.current!.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    gsap.to(ref.current, { rotateY: base.ry + px * max, rotateX: base.rx - py * max, duration: 0.8, ease: 'power3.out' });
  };
  const onLeave = () => {
    onHoverChange?.(false);
    if (enabled) gsap.to(ref.current, { rotateX: base.rx, rotateY: base.ry, duration: 1.2, ease: 'expo.out' });
  };
  return (
    <div ref={ref} onPointerMove={onMove} onPointerEnter={() => onHoverChange?.(true)} onPointerLeave={onLeave} className={className} style={{ transformStyle: 'preserve-3d' }}>
      {children}
    </div>
  );
}

export function ComingSoon({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-gold-bright ${className}`}>
      Coming soon
    </span>
  );
}
