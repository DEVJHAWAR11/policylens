import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown, stripMarkdown } from './markdown';
import { matchItems } from './highlight';

describe('parseMarkdown', () => {
  it('turns an LLM answer into headings, lists and bold runs', () => {
    const blocks = parseMarkdown('**Free Look Period**\n\n- **Duration:** 15 days\n  - **Online:** 30 days\n- Refund minus stamp duty\n\n---\n*Source: Condition 6*');
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'list', 'rule', 'para']);
    const list = blocks[1] as Extract<(typeof blocks)[number], { type: 'list' }>;
    expect(list.items).toHaveLength(3);
    expect(list.items[1].depth).toBe(1);
    expect(list.items[0].inline[0]).toEqual({ text: 'Duration:', bold: true });
  });

  it('keeps plain text and never produces markup strings', () => {
    expect(parseInline('a <b>x</b> **y**')).toEqual([{ text: 'a <b>x</b> ' }, { text: 'y', bold: true }]);
  });

  it('parses a pipe table instead of leaving it as one paragraph', () => {
    const md = 'Intro\n\n| Feature | What the policy says | Source |\n|---|:--:|--:|\n| **Policy Term** | “term of the Policy” | Part B, clause 3.1 |\n| Grace period | Not applicable |\n\nAfter';
    const blocks = parseMarkdown(md);
    expect(blocks.map((b) => b.type)).toEqual(['para', 'table', 'para']);
    const t = blocks[1] as Extract<(typeof blocks)[number], { type: 'table' }>;
    expect(t.header).toHaveLength(3);
    expect(t.align).toEqual([undefined, 'center', 'right']);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0][0]).toEqual([{ text: 'Policy Term', bold: true }]);
    expect(t.rows[1]).toHaveLength(3); // short row padded to the header width
  });

  it('keeps an escaped pipe inside its cell', () => {
    const t = parseMarkdown('| a | b |\n|---|---|\n| x \\| y | z |')[0] as Extract<ReturnType<typeof parseMarkdown>[number], { type: 'table' }>;
    expect(t.rows[0][0]).toEqual([{ text: 'x | y' }]);
  });

  it('strips markdown for previews', () => {
    expect(stripMarkdown('**Free Look**\n- **Duration:** 15 days')).toBe('Free Look Duration: 15 days');
  });
});

describe('matchItems', () => {
  const passage = '6. Free Look period: During the Free Look period of 15 days (30 days if this policy is purchased online)';
  it('highlights runs of the cited passage', () => {
    expect(matchItems(['6. Free Look period:', 'During the Free Look period of 15 days', '(30 days if this policy is purchased online)'], passage))
      .toEqual([true, true, true]);
  });
  it('drops an isolated short phrase elsewhere on the page', () => {
    expect(matchItems(['iv) ', 'During the', ' Deferment Period, in the event of failure'], passage)).toEqual([false, false, false]);
  });
});
