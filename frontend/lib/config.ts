// The five knobs for the landing page's atmosphere. Everything else derives from these.
export const PARTICLE_COUNT = 40; // dust motes in the hero (halved on mobile, 0 with reduced motion)
export const PARALLAX_STRENGTH = 10; // max px a scene layer drifts on mouse / scroll
export const SCROLL_LERP = 0.08; // Lenis smoothing (lower = smoother, floatier)
export const GRAIN_OPACITY = 0.04; // film-grain overlay
export const DEMO_LOOP_MS = 12_000; // one full cycle of the hero's scripted product demo

// Real numbers only (docs/RAG_EVAL.md, deterministic scoring over a real LIC policy).
export const EVAL_STATS = [
  { value: 23, suffix: '/24', label: 'Eval questions answered correctly' },
  { value: 4, suffix: '/4', label: 'Out-of-document questions correctly refused' },
  { value: 24, suffix: '/24', label: 'Questions where retrieval found the evidence' },
  { value: 5, suffix: '', label: 'Policies you can compare in one question' },
];
