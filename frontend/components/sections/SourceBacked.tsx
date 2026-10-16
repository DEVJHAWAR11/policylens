'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText } from 'lucide-react';

// Each answer sentence maps to the clause (and page) it came from. Hover or focus a sentence.
const PAIRS = [
  {
    answer: 'Hospital stays are covered up to your sum insured.',
    clause: '3.1 The Company shall indemnify medically necessary in-patient hospitalisation expenses exceeding twenty-four (24) hours, up to the Sum Insured stated in the Schedule.',
    ref: 'Section 3.1', page: 7,
  },
  {
    answer: 'Pre-existing illnesses are covered only after 36 months.',
    clause: '4.2 The Company shall not be liable for any claim arising from a pre-existing disease until thirty-six (36) months of continuous coverage have elapsed.',
    ref: 'Section 4.2', page: 12,
  },
  {
    answer: 'You pay 20% of each claim if you are over 60.',
    clause: '6.4 Where the Insured Person is aged sixty (60) years or above at entry, a co-payment of twenty per cent (20%) shall apply to every admissible claim.',
    ref: 'Section 6.4', page: 18,
  },
];

export default function SourceBacked() {
  const [active, setActive] = useState(1);

  return (
    <section id="sources" className="relative px-4 py-28 sm:px-8" aria-labelledby="sources-title">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_40%_at_70%_40%,rgba(217,174,107,0.10),transparent)]" aria-hidden />
      <div className="relative mx-auto max-w-[1320px]">
        <div className="max-w-2xl">
          <p className="mb-4 font-mono text-[12px] uppercase tracking-[0.3em] text-gold">Source-backed answers</p>
          <h2 id="sources-title" className="font-display text-[clamp(2.4rem,4.5vw,4rem)] font-semibold leading-[1] text-cream">Every sentence<br />knows where it <span className="text-gold-grad">came from.</span></h2>
          <p className="mt-5 text-[16px] leading-relaxed text-muted">Hover a line of the answer. The clause behind it lights up in the document, with its page. No answer without evidence — and when the policy doesn’t say, PolicyLens says so.</p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <div className="panel rounded-3xl p-6 sm:p-8">
            <p className="mb-5 text-[13px] text-muted">Q · What does this policy cover, and what are the catches?</p>
            <div className="space-y-2 text-[clamp(1.1rem,1.8vw,1.35rem)] leading-relaxed">
              {PAIRS.map((p, i) => (
                <button
                  key={p.ref}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                  aria-pressed={active === i}
                  className={`block w-full rounded-xl px-4 py-3 text-left font-display transition-all duration-500 ${active === i ? 'bg-gold/10 text-cream' : 'text-cream/55 hover:text-cream/80'}`}
                >
                  {p.answer}
                  <span className={`ml-2 align-middle font-mono text-[11px] transition-colors ${active === i ? 'text-gold-bright' : 'text-muted/60'}`}>[{p.ref}]</span>
                </button>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-3xl bg-[#efe6d6] p-6 text-[#2a2118] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)] sm:p-8">
            <div className="mb-5 flex items-center gap-2 text-[12px] text-[#5a4c3a]"><FileText size={14} aria-hidden /> Health_Shield_Policy.pdf</div>
            <div className="space-y-4 font-display text-[15px] leading-relaxed">
              {PAIRS.map((p, i) => (
                <p key={p.ref} className={`transition-opacity duration-500 ${active === i ? 'opacity-100' : 'opacity-45'}`}>
                  <mark className="clause-mark" data-on={active === i}>{p.clause}</mark>
                </p>
              ))}
            </div>
            <motion.div
              key={active}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              className="pulse-gold absolute right-5 top-5 rounded-full bg-[#2a2118] px-3 py-1 font-mono text-[11px] text-gold-bright"
            >
              Page {PAIRS[active].page}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
