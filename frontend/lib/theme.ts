export type Theme = 'dark' | 'light';

export const THEME_KEY = 'pl_theme';
export const THEME_EVENT = 'policylens:theme';

// Runs in <head> before first paint, so the page never flashes the wrong theme.
// Saved choice wins; otherwise follow the OS; dark if anything fails.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='dark'}})();`;

export const currentTheme = (): Theme =>
  typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: theme }));
}

type VT = { ready: Promise<void>; finished: Promise<void> };
type DocWithVT = Document & { startViewTransition?: (cb: () => void) => VT };

// Switches theme. With the View Transitions API the new theme grows as a circle from
// (x, y) — the toggle — over everything, scene included. Otherwise colours cross-fade.
export function switchTheme(next: Theme, origin?: { x: number; y: number }) {
  const doc = document as DocWithVT;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduced) { apply(next); return; }

  if (!doc.startViewTransition) {
    const root = document.documentElement;
    root.classList.add('theme-fade');
    apply(next);
    window.setTimeout(() => root.classList.remove('theme-fade'), 750);
    return;
  }

  const x = origin?.x ?? window.innerWidth - 40;
  const y = origin?.y ?? 40;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const vt = doc.startViewTransition(() => apply(next));
  vt.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 900, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  }).catch(() => { /* transition skipped — theme is already applied */ });
}
