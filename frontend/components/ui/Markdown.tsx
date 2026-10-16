import { Fragment, useMemo } from 'react';
import { parseMarkdown, type Inline } from '@/lib/markdown';

function Runs({ inline }: { inline: Inline[] }) {
  return (
    <>
      {inline.map((r, i) => {
        if (r.bold && r.italic) return <strong key={i} className="font-semibold text-cream"><em>{r.text}</em></strong>;
        if (r.bold) return <strong key={i} className="font-semibold text-cream">{r.text}</strong>;
        if (r.italic) return <em key={i} className="text-cream/75">{r.text}</em>;
        return <Fragment key={i}>{r.text}</Fragment>;
      })}
    </>
  );
}

export default function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className={`space-y-2.5 ${className}`}>
      {blocks.map((b, i) => {
        if (b.type === 'rule') return <hr key={i} className="border-line" />;
        if (b.type === 'heading') return <p key={i} className="font-display text-[1.15rem] font-semibold leading-snug text-cream"><Runs inline={b.inline} /></p>;
        if (b.type === 'para') return <p key={i}><Runs inline={b.inline} /></p>;
        const Tag = b.ordered ? 'ol' : 'ul';
        return (
          <Tag key={i} className="space-y-1.5">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-2.5" style={{ paddingLeft: it.depth * 16 }}>
                {b.ordered && it.depth === 0
                  ? <span className="shrink-0 font-mono text-[11.5px] leading-[1.9] text-gold">{j + 1}.</span>
                  : <span className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-gold" aria-hidden />}
                <span><Runs inline={it.inline} /></span>
              </li>
            ))}
          </Tag>
        );
      })}
    </div>
  );
}
