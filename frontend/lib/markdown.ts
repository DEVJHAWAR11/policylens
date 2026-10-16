// Tiny markdown subset for LLM answers: headings, bullet / numbered lists, rules, paragraphs,
// and inline **bold** / *italic*. Produces a plain data tree (no HTML strings), so rendering
// can never inject markup.

export type Inline = { text: string; bold?: boolean; italic?: boolean };
export type Block =
  | { type: 'heading'; inline: Inline[] }
  | { type: 'para'; inline: Inline[] }
  | { type: 'list'; ordered: boolean; items: { inline: Inline[]; depth: number }[] }
  | { type: 'rule' };

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*|\*(?!\s)(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) });
    if (m[1] !== undefined) {
      // bold may itself contain *italic*
      parseInline(m[1]).forEach((p) => out.push({ ...p, bold: true }));
    } else out.push({ text: m[2], italic: true });
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out.filter((p) => p.text);
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'para', inline: parseInline(para.join(' ')) });
    para = [];
  };

  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    if (/^\s*(-{2,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); blocks.push({ type: 'rule' }); continue; }
    const h = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (h) { flush(); blocks.push({ type: 'heading', inline: parseInline(h[1]) }); continue; }
    const li = line.match(/^(\s*)([-*•]|\d+[.)])\s+(.*)$/);
    if (li) {
      flush();
      const ordered = /\d/.test(li[2]);
      const depth = Math.min(2, Math.floor(li[1].replace(/\t/g, '  ').length / 2));
      const prev = blocks.at(-1);
      const item = { inline: parseInline(li[3]), depth };
      if (prev?.type === 'list' && (prev.ordered === ordered || depth > 0)) prev.items.push(item);
      else blocks.push({ type: 'list', ordered, items: [item] });
      continue;
    }
    // a line that is only bold text reads as a heading
    const solo = line.match(/^\s*\*\*([^*]+)\*\*:?\s*$/);
    if (solo) { flush(); blocks.push({ type: 'heading', inline: [{ text: solo[1] }] }); continue; }
    para.push(line.trim());
  }
  flush();
  return blocks;
}

// Plain text for previews (history list, titles).
export const stripMarkdown = (src: string) =>
  src.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(?!\s)(.+?)\*/g, '$1').replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '').replace(/^\s*-{2,}\s*$/gm, '').replace(/\s+/g, ' ').trim();
