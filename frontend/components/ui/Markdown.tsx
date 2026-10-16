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
        if (b.type === 'table') {
          const alignClass = (c: number) => (b.align[c] === 'center' ? 'text-center' : b.align[c] === 'right' ? 'text-right' : 'text-left');
          return (
            <div key={i} className="scrollbar-thin -mx-1 overflow-x-auto rounded-xl border border-line">
              <table className="w-full border-collapse text-[13px] leading-snug">
                <thead>
                  <tr className="bg-gold/10">
                    {b.header.map((h, c) => (
                      <th key={c} scope="col" className={`border-b border-line px-3 py-2 align-bottom font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-gold-bright ${alignClass(c)}`}>
                        <Runs inline={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((row, r) => (
                    <tr key={r} className="border-b border-line/70 align-top last:border-b-0 odd:bg-white/[0.02]">
                      {row.map((cell, c) => (
                        <td key={c} className={`min-w-[7rem] px-3 py-2 ${c === 0 ? 'font-medium text-cream' : ''} ${alignClass(c)}`}>
                          <Runs inline={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
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
