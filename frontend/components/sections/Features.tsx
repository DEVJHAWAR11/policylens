import { BarChart3, FileText, History, Link2, RefreshCcw, Scale, Sparkles } from 'lucide-react';
import { ComingSoon, SpotlightCard } from '@/components/ui/motion';

const CARDS = [
  { icon: FileText, title: 'Document Q&A', body: 'Ask anything about your policy in plain English and watch the answer stream in, word by word.', span: 'md:col-span-2 md:row-span-2', big: true },
  { icon: Link2, title: 'Citations', body: 'Section and page on every answer. Click a citation to open the PDF at that page, clause highlighted.', span: 'md:col-span-2' },
  { icon: BarChart3, title: 'Summaries', body: 'Benefits, exclusions, waiting periods and free-look terms — extracted and rewritten in plain language.', span: '' },
  { icon: Scale, title: 'Compare', body: 'Ask one question across two to five policies and see where they differ.', span: '' },
  { icon: History, title: 'History', body: 'Every question and answer is saved per policy and searchable.', span: '' },
  { icon: RefreshCcw, title: 'Resilient uploads', body: 'Uploads survive dropped connections and reloads; processing resumes on its own.', span: '' },
  { icon: Sparkles, title: 'Related questions', body: 'Suggested follow-ups drawn from your policy’s own sections.', span: 'md:col-span-2', soon: true },
];

export default function Features() {
  return (
    <section id="features" className="px-4 py-28 sm:px-8" aria-labelledby="features-title">
      <div className="mx-auto max-w-[1320px]">
        <p className="mb-4 font-mono text-[12px] uppercase tracking-[0.3em] text-gold">Features</p>
        <h2 id="features-title" className="max-w-3xl font-display text-[clamp(2.4rem,4.5vw,4rem)] font-semibold leading-[1] text-cream">Built for the questions<br />policies make hard.</h2>
        <div className="mt-14 grid auto-rows-[minmax(190px,auto)] grid-cols-1 gap-4 md:grid-cols-4">
          {CARDS.map(({ icon: Icon, title, body, span, big, soon }) => (
            <SpotlightCard key={title} className={span}>
              <div className={`flex h-full flex-col p-7 ${big ? 'justify-between' : ''}`}>
                <div className="flex items-center justify-between">
                  <Icon size={big ? 34 : 24} strokeWidth={1.2} className="text-gold" aria-hidden />
                  {soon && <ComingSoon />}
                </div>
                <div className={big ? 'mt-10' : 'mt-6'}>
                  <h3 className={`font-display font-semibold text-cream ${big ? 'text-4xl' : 'text-2xl'}`}>{title}</h3>
                  <p className={`mt-2 leading-relaxed text-muted ${big ? 'max-w-md text-[16px]' : 'text-[14.5px]'}`}>{body}</p>
                </div>
                {big && (
                  <div className="mt-8 rounded-2xl border border-line bg-inset p-4 text-[14px] text-cream/85">
                    <span className="text-muted">You · </span>Is ambulance cost covered?
                    <div className="mt-2 border-t border-line pt-2">Yes — up to ₹2,000 per hospitalisation. <span className="font-mono text-[11px] text-gold-bright">[Section 3.6 · p.9]</span></div>
                  </div>
                )}
              </div>
            </SpotlightCard>
          ))}
        </div>
      </div>
    </section>
  );
}
