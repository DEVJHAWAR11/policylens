// Decides which pdf.js text items belong to a cited passage.
// Lowercase letters/digits only, so markdown (**, #, |) in chunk text and PDF spacing don't matter.
export const normText = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

const MIN_ITEM = 5; // ignore tiny fragments ("of", "1.")
const SOLO_MIN = 16; // a short match must touch another match to count ("During the" alone is noise)

export function matchItems(items: string[], passage: string): boolean[] {
  const target = normText(passage);
  const norm = items.map(normText);
  const hit = norm.map((s) => s.length >= MIN_ITEM && target.includes(s));
  // Neighbours skip empty/whitespace items, which pdf.js emits between runs.
  const neighbour = (i: number, dir: 1 | -1) => {
    for (let j = i + dir; j >= 0 && j < items.length; j += dir) if (norm[j].length) return j;
    return -1;
  };
  return hit.map((h, i) => {
    if (!h || norm[i].length >= SOLO_MIN) return h;
    const p = neighbour(i, -1);
    const n = neighbour(i, 1);
    return (p >= 0 && hit[p]) || (n >= 0 && hit[n]);
  });
}
