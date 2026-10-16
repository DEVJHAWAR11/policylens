'use client';

import { useEffect } from 'react';

// Scroll-in reveals for the landing sections, built on IntersectionObserver + CSS transitions
// (see .rv in globals.css). Unlike ScrollTrigger tweens they can't be undone by the pinned
// scenes' refreshes, and they work the same for touch scrolling and wheel scrolling.
// The pinned desktop scenes (How it works, horizontal use cases) keep their own motion;
// below `lg` the steps and use-case cards get a reveal of their own.

interface Group { sel: string; y?: number; stagger?: number }

const EVERYWHERE: Group[] = [
  { sel: '#how h2, #sources h2, #features h2, #use-cases h2, #under-the-hood h2, #faq h2', y: 28 },
  { sel: '#how h2 ~ p, #sources h2 ~ p, #under-the-hood h2 ~ p', y: 20 },
  { sel: '#sources .panel, #sources .rounded-3xl.bg-\\[\\#efe6d6\\]', y: 44, stagger: 0.16 },
  { sel: '#features .group', y: 40, stagger: 0.08 },
  { sel: '#faq li', y: 24, stagger: 0.06 },
];
const SMALL_SCREENS: Group[] = [
  { sel: '#how ol > li', y: 44, stagger: 0.12 },
  // the cards sit in a swipeable row, so reveal the row itself (cards 3-5 are off-screen sideways)
  { sel: '#use-cases .overflow-x-auto', y: 40 },
];

function run(groups: Group[]) {
  const timers: number[] = [];
  const observers: IntersectionObserver[] = [];
  const touched = new Set<HTMLElement>();

  for (const g of groups) {
    const els = Array.from(document.querySelectorAll<HTMLElement>(g.sel)).filter((e) => !touched.has(e));
    if (!els.length) continue;
    const stagger = g.stagger ?? 0.1;
    els.forEach((el) => {
      touched.add(el);
      el.style.setProperty('--rv-y', `${g.y ?? 32}px`);
      el.classList.add('rv');
    });
    const io = new IntersectionObserver((entries) => {
      entries.filter((e) => e.isIntersecting).forEach((e, i) => {
        const el = e.target as HTMLElement;
        io.unobserve(el);
        el.style.transitionDelay = `${i * stagger}s`;
        el.classList.add('rv-in');
        // hand the element back to its own transitions (hover etc.) once the reveal is over
        timers.push(window.setTimeout(() => {
          el.classList.remove('rv', 'rv-in');
          el.style.removeProperty('transition-delay');
          el.style.removeProperty('--rv-y');
        }, 1300 + i * stagger * 1000));
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
    els.forEach((el) => io.observe(el));
    observers.push(io);
  }

  return () => {
    timers.forEach(clearTimeout);
    observers.forEach((o) => o.disconnect());
    touched.forEach((el) => {
      el.classList.remove('rv', 'rv-in');
      el.style.removeProperty('transition-delay');
      el.style.removeProperty('--rv-y');
    });
  };
}

export function useScrollReveal() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const small = window.matchMedia('(max-width: 1023px)');
    let stop = run(small.matches ? [...EVERYWHERE, ...SMALL_SCREENS] : EVERYWHERE);
    const onChange = () => { stop(); stop = run(small.matches ? [...EVERYWHERE, ...SMALL_SCREENS] : EVERYWHERE); };
    small.addEventListener('change', onChange);
    return () => { small.removeEventListener('change', onChange); stop(); };
  }, []);
}
