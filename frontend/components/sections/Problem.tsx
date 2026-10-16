'use client';

import { useRef } from 'react';
import { gsap, useGsap } from '@/hooks/useGsap';

const FINE_PRINT = `Notwithstanding anything to the contrary contained herein, the Company shall not be liable to make any payment under this Policy in respect of any expenses whatsoever incurred by any Insured Person in connection with or in respect of any pre-existing condition, ailment or injury, as defined hereinabove, until the expiry of thirty-six (36) months of continuous coverage from the date of inception of the first Policy with the Company, subject always to the Sum Insured, Sub-limits, Co-payment and Deductible, if any, specified in the Schedule, and further subject to the condition that such coverage has been renewed without break in accordance with Section 7.3, provided that portability benefits under the applicable regulations shall be extended only to the extent of the Sum Insured under the previous policy and that any enhancement of the Sum Insured shall be subject to fresh waiting periods as applicable to such enhanced amount, and the Insured shall disclose all material facts at the time of proposal failing which the Company reserves the right to repudiate the claim and cancel the Policy without refund of premium. `;

export default function Problem() {
  const root = useRef<HTMLElement>(null);

  useGsap(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: root.current, start: 'top top', end: '+=140%', scrub: 1, pin: true },
      });
      tl.to('[data-fine]', { filter: 'blur(9px)', opacity: 0.12, scale: 1.04, ease: 'none' }, 0)
        .fromTo('[data-plain]', { filter: 'blur(14px)', opacity: 0, y: 30 }, { filter: 'blur(0px)', opacity: 1, y: 0, ease: 'power2.out' }, 0.25)
        .fromTo('[data-caption]', { opacity: 0 }, { opacity: 1 }, 0.7);
    });
    mm.add('(prefers-reduced-motion: reduce)', () => {
      gsap.set('[data-fine]', { opacity: 0.12 });
      gsap.set(['[data-plain]', '[data-caption]'], { opacity: 1 });
    });
  }, root);

  return (
    <section ref={root} id="problem" className="relative grid min-h-[100svh] place-items-center overflow-hidden px-4 py-24 sm:px-8" aria-labelledby="problem-title">
      <div data-fine aria-hidden className="absolute inset-0 overflow-hidden px-6 py-10 font-display text-[15px] leading-[1.55] text-cream/55 sm:text-[17px]">
        {FINE_PRINT.repeat(5)}
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(var(--scrim),0.85)_20%,rgba(var(--scrim),0.4)_70%)]" aria-hidden />
      <div className="relative max-w-4xl text-center">
        <p className="mb-6 font-mono text-[12px] uppercase tracking-[0.3em] text-gold">The problem</p>
        <h2 id="problem-title" className="sr-only">Policies are written to be hard to read</h2>
        <p data-plain className="font-display text-[clamp(2rem,4.6vw,4rem)] font-medium leading-[1.05] text-cream">
          “Pre-existing illnesses aren’t covered for your <span className="text-gold-grad">first 36 months.</span>”
        </p>
        <p data-caption className="mx-auto mt-8 max-w-xl text-[16px] leading-relaxed text-muted">
          That is the whole paragraph behind it. PolicyLens reads the fine print so you can read the sentence — and still shows you the clause it came from.
        </p>
      </div>
    </section>
  );
}
