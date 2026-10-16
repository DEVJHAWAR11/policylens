// Tiny markdown subset for LLM answers: headings, bullet / numbered lists, rules, paragraphs,
// and inline **bold** / *italic*. Produces a plain data tree (no HTML strings), so rendering
// can never inject markup.

export type Inline = { text: string; bold?: boolean; italic?: boolean };
export type Block =
  | { type: 'heading'; inline: Inline[] }
  | { type: 'para'; inline: Inline[] }
  | { type: 'list'; ordered: boolean; items: { inline: Inline[]; depth: number }[] }
  | { type: 'table'; header: Inline[][]; align: (Align | undefined)[]; rows: Inline[][][] }
  | { type: 'rule' };

export type Align = 'left' | 'center' | 'right';

// "| a | b |" -> ['a', 'b']  (outer pipes optional, "\|" stays inside the cell)
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
}

const isTableLine = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isSeparatorRow = (cells: string[]) => cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));

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

  const lines = src.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line.trim()) { flush(); continue; }
    // GitHub-style table: header row, "|---|---|" separator, then body rows
    if (isTableLine(line) && isSeparatorRow(splitRow(lines[i + 1] ?? ''))) {
      flush();
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map((c): Align | undefined =>
        c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : undefined);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && isTableLine(lines[i])) {
        const cells = splitRow(lines[i]);
        // pad / trim so every row matches the header width
        rows.push(head.map((_, c) => parseInline(cells[c] ?? '')));
        i++;
      }
      i--; // the for-loop increments again
      blocks.push({ type: 'table', header: head.map((c) => parseInline(c)), align, rows });
      continue;
    }
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
    .replace(/^\s*[-*•]\s+/gm, '').replace(/^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/gm, '')
    .replace(/^\s*\|(.*)\|\s*$/gm, (_, row: string) => row.replace(/\s*\|\s*/g, ' · ').trim())
    .replace(/\s+/g, ' ').trim();
