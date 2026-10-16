'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Plus } from 'lucide-react';
import HeroScene from '@/components/hero/HeroScene';
import { Magnet } from '@/components/ui/motion';

const FAQ = [
  { q: 'Which documents work best?', a: 'Text-based PDFs up to 25 MB: insurance policies, policy wordings, government circulars and regulatory guidelines. Scanned images without a text layer are not read yet.' },
  { q: 'How do I know an answer is right?', a: 'Every answer comes with the sections and pages it was drawn from. Click a citation to open the PDF at that page with the passage highlighted, and check it yourself.' },
  { q: 'What if the policy doesn’t answer my question?', a: 'PolicyLens is instructed to say the document does not cover it rather than guess. In our evaluation it declined all four questions the policy could not answer.' },
  { q: 'Who can see my documents?', a: 'Only you. Every request is checked against your account, PDFs are served through short-lived signed links, and deleting a policy removes the file, its index, summary and chat history.' },
  { q: 'Can I compare two policies?', a: 'Yes. Select two to five processed policies in your workspace and ask one question across all of them.' },
  { q: 'Is this legal or insurance advice?', a: 'No. PolicyLens explains what your document says. For decisions, speak to your insurer or a licensed advisor.' },
];

export default function FaqCta() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <>
      <section id="faq" className="px-4 py-28 sm:px-8" aria-labelledby="faq-title">
        <div className="mx-auto grid max-w-[1320px] gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="mb-4 font-mono text-[12px] uppercase tracking-[0.3em] text-gold">FAQ</p>
            <h2 id="faq-title" className="font-display text-[clamp(2.4rem,4.5vw,4rem)] font-semibold leading-[1] text-cream">Questions,<br />answered plainly.</h2>
          </div>
          <ul className="divide-y divide-line border-y border-line">
            {FAQ.map((item, i) => {
              const isOpen = open === i;
              return (
                <li key={item.q}>
                  <h3>
                    <button
                      id={`faq-btn-${i}`}
                      aria-expanded={isOpen}
                      aria-controls={`faq-panel-${i}`}
                      onClick={() => setOpen(isOpen ? null : i)}
                      className="flex w-full items-center justify-between gap-6 py-6 text-left font-display text-[1.4rem] text-cream transition-colors hover:text-gold-bright"
                    >
                      {item.q}
                      <Plus size={20} className={`shrink-0 text-gold transition-transform duration-500 ${isOpen ? 'rotate-45' : ''}`} aria-hidden />
                    </button>
                  </h3>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        id={`faq-panel-${i}`}
                        role="region"
                        aria-labelledby={`faq-btn-${i}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <p className="max-w-2xl pb-6 text-[16px] leading-relaxed text-muted">{item.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="relative isolate overflow-hidden px-4 py-40 text-center sm:px-8" aria-labelledby="cta-title">
        <HeroScene dim />
        <div className="relative z-10 mx-auto max-w-3xl">
          <h2 id="cta-title" className="font-display text-[clamp(2.6rem,6vw,5.2rem)] font-semibold leading-[0.98] text-cream">
            Read the policy<br /><span className="text-gold-grad">in a minute.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-[17px] text-cream/75">Upload a PDF and ask your first question.</p>
          <div className="mt-10 flex justify-center">
            <Magnet strength={0.4}><Link href="/login/?mode=signup" className="btn-gold !px-8 !py-4 text-base">Try PolicyLens <ArrowRight size={18} aria-hidden /></Link></Magnet>
          </div>
        </div>
      </section>
    </>
  );
}
