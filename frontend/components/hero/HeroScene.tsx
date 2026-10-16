'use client';

import { useEffect, useRef } from 'react';
import { gsap, ScrollTrigger, useReducedMotion } from '@/hooks/useGsap';
import { PARALLAX_STRENGTH, PARTICLE_COUNT } from '@/lib/config';
import DustMotes from './DustMotes';

/*
  The hero's "legal library at golden hour", built entirely in SVG/CSS.
  Layers (back → front): base glow · far (dome through an arch) · mid (wall, marble columns)
  · foreground (desk, law books, papers, pen, brass lamp) · atmosphere (rays, dust, vignette).
  Every layer is its own element with a depth, so parallax moves them at different speeds.
  Pass `imageSrc` to replace the coded scene with your own artwork; the atmosphere stays.
*/

const VB = '0 0 1600 900';
const ARCH = 'M905 640 L905 300 Q905 70 1105 70 Q1305 70 1305 300 L1305 640 Z';

function Layer({ depth, children, className = '' }: { depth: number; children: React.ReactNode; className?: string }) {
  return (
    <div data-depth={depth} className={`absolute inset-[-24px] will-change-transform ${className}`}>
      {children}
    </div>
  );
}

function Column({ x, w, top = 0, bottom = 650, id }: { x: number; w: number; top?: number; bottom?: number; id: string }) {
  const flutes = 7;
  return (
    <g>
      <defs>
        <linearGradient id={`col-${id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#0d0907" />
          <stop offset="0.45" stopColor="#21170f" />
          <stop offset="0.8" stopColor="#3a2918" />
          <stop offset="0.95" stopColor="#8a6436" />
          <stop offset="1" stopColor="#c9975a" />
        </linearGradient>
      </defs>
      {/* capital */}
      <rect x={x - 14} y={top + 40} width={w + 28} height={26} fill="#1c140d" />
      <rect x={x - 22} y={top + 22} width={w + 44} height={20} fill="#16100b" />
      <rect x={x + w - 4} y={top + 22} width={26} height={44} fill="#a77a43" opacity={0.25} />
      {/* shaft */}
      <rect x={x} y={top + 66} width={w} height={bottom - top - 100} fill={`url(#col-${id})`} />
      {Array.from({ length: flutes }, (_, i) => (
        <line key={i} x1={x + ((i + 1) * w) / (flutes + 1)} x2={x + ((i + 1) * w) / (flutes + 1)} y1={top + 70} y2={bottom - 38}
          stroke={i > flutes - 3 ? '#d9ae6b' : '#000'} strokeOpacity={i > flutes - 3 ? 0.18 : 0.35} strokeWidth={1.2} />
      ))}
      {/* base */}
      <rect x={x - 12} y={bottom - 36} width={w + 24} height={18} fill="#1a120c" />
      <rect x={x - 20} y={bottom - 18} width={w + 40} height={18} fill="#120c08" />
    </g>
  );
}

function CodedScene() {
  return (
    <>
      {/* 2 · far: the dome, hazy, seen through the arch */}
      <Layer depth={0.25}>
        <svg viewBox={VB} preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#4a3420" />
              <stop offset="0.45" stopColor="#b9874d" />
              <stop offset="0.7" stopColor="#f0c27e" />
              <stop offset="1" stopColor="#8a5d31" />
            </linearGradient>
            <radialGradient id="sun" cx="0.62" cy="0.62" r="0.5">
              <stop offset="0" stopColor="#ffe2a8" stopOpacity="0.9" />
              <stop offset="1" stopColor="#ffe2a8" stopOpacity="0" />
            </radialGradient>
            <clipPath id="arch-clip"><path d={ARCH} /></clipPath>
            <filter id="haze"><feGaussianBlur stdDeviation="7" /></filter>
          </defs>
          <g clipPath="url(#arch-clip)">
            <rect x="880" y="40" width="460" height="620" fill="url(#sky)" />
            <rect x="880" y="40" width="460" height="620" fill="url(#sun)" />
            <g filter="url(#haze)" fill="#5a3a20" opacity="0.85">
              {/* dome building */}
              <rect x="1010" y="390" width="190" height="200" />
              <rect x="960" y="455" width="290" height="140" />
              <rect x="1030" y="330" width="150" height="70" />
              <path d="M1030 335 Q1030 205 1105 200 Q1180 205 1180 335 Z" />
              <rect x="1092" y="160" width="26" height="45" />
              <path d="M1098 162 L1105 120 L1112 162 Z" />
              {Array.from({ length: 6 }, (_, i) => <rect key={i} x={1040 + i * 24} y="340" width="8" height="55" fill="#7a5130" />)}
            </g>
            {/* trees */}
            <g filter="url(#haze)" fill="#2c1d10" opacity="0.9">
              <ellipse cx="930" cy="560" rx="80" ry="70" />
              <ellipse cx="1290" cy="540" rx="70" ry="90" />
              <ellipse cx="1240" cy="600" rx="110" ry="60" />
              <ellipse cx="980" cy="610" rx="120" ry="50" />
            </g>
          </g>
        </svg>
      </Layer>

      {/* 3 · mid: wall with the arch opening, marble columns with gold rim light */}
      <Layer depth={0.55}>
        <svg viewBox={VB} preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="wall" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#0c0806" />
              <stop offset="0.55" stopColor="#1a120b" />
              <stop offset="1" stopColor="#24180e" />
            </linearGradient>
          </defs>
          <path fillRule="evenodd" fill="url(#wall)" d={`M0 0 H1600 V900 H0 Z ${ARCH}`} />
          {/* arch reveal + rim light */}
          <path d="M905 640 L905 300 Q905 70 1105 70 Q1305 70 1305 300 L1305 640" fill="none" stroke="#3a2817" strokeWidth="26" />
          <path d="M890 640 L890 300 Q890 52 1105 52 Q1320 52 1320 300 L1320 640" fill="none" stroke="#d9ae6b" strokeOpacity="0.28" strokeWidth="1.5" />
          {/* wall panelling */}
          <g stroke="#d9ae6b" strokeOpacity="0.06" fill="none">
            <rect x="200" y="120" width="420" height="440" />
            <rect x="230" y="150" width="360" height="380" />
          </g>
          <Column id="a" x={18} w={120} top={-20} />
          <Column id="b" x={720} w={150} top={-30} />
          <Column id="c" x={1350} w={130} top={-20} />
        </svg>
      </Layer>

      {/* 4 · foreground: desk, books, papers, pen, lamp */}
      <Layer depth={1}>
        <svg viewBox={VB} preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="desk" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2a1c11" />
              <stop offset="0.15" stopColor="#140d08" />
              <stop offset="1" stopColor="#070504" />
            </linearGradient>
            <radialGradient id="reflect" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#f0c27e" stopOpacity="0.35" />
              <stop offset="1" stopColor="#f0c27e" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="leather1" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#4a2c19" /><stop offset="1" stopColor="#24140b" /></linearGradient>
            <linearGradient id="leather2" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3b2414" /><stop offset="1" stopColor="#1c0f08" /></linearGradient>
            <linearGradient id="leather3" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2f1d11" /><stop offset="1" stopColor="#150b06" /></linearGradient>
            <linearGradient id="brass" x1="0" x2="1"><stop offset="0" stopColor="#5a3d1c" /><stop offset="0.5" stopColor="#d9ae6b" /><stop offset="1" stopColor="#6b4a22" /></linearGradient>
            <linearGradient id="paper" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#d9ccb2" /><stop offset="1" stopColor="#8f8268" /></linearGradient>
            <filter id="soft"><feGaussianBlur stdDeviation="10" /></filter>
          </defs>
          {/* desk */}
          <path d="M0 648 H1600 V900 H0 Z" fill="url(#desk)" />
          <path d="M0 648 H1600" stroke="#d9ae6b" strokeOpacity="0.3" strokeWidth="1.5" />
          <ellipse cx="1105" cy="700" rx="260" ry="30" fill="url(#reflect)" filter="url(#soft)" />

          {/* law books */}
          {[
            { y: 548, w: 430, fill: 'url(#leather1)', label: 'Insurance Policies' },
            { y: 584, w: 450, fill: 'url(#leather2)', label: 'Regulatory Guidelines' },
            { y: 620, w: 470, fill: 'url(#leather3)', label: 'Government Circulars' },
          ].map((b, i) => (
            <g key={b.label} transform={`translate(${-20 + i * 6} 0)`}>
              <rect x="0" y={b.y} width={b.w} height="34" rx="4" fill={b.fill} />
              <rect x="0" y={b.y} width={b.w} height="2" fill="#d9ae6b" opacity="0.25" />
              <line x1="40" x2="40" y1={b.y + 4} y2={b.y + 30} stroke="#d9ae6b" strokeOpacity="0.5" />
              <line x1="48" x2="48" y1={b.y + 4} y2={b.y + 30} stroke="#d9ae6b" strokeOpacity="0.35" />
              <line x1={b.w - 48} x2={b.w - 48} y1={b.y + 4} y2={b.y + 30} stroke="#d9ae6b" strokeOpacity="0.35" />
              <text x={b.w / 2 + 10} y={b.y + 22} textAnchor="middle" fill="#d9ae6b" fillOpacity="0.85"
                style={{ font: '500 15px var(--font-cormorant), Georgia, serif', letterSpacing: '0.04em' }}>{b.label}</text>
            </g>
          ))}

          {/* papers */}
          <g opacity="0.6">
            <path d="M640 700 L1080 682 L1120 760 L620 790 Z" fill="url(#paper)" />
            <path d="M700 712 L1110 698 L1150 770 L690 796 Z" fill="url(#paper)" opacity="0.8" />
            {Array.from({ length: 6 }, (_, i) => (
              <line key={i} x1={720 + i * 3} y1={724 + i * 10} x2={1090 - i * 2} y2={710 + i * 10} stroke="#2a1e10" strokeOpacity="0.4" />
            ))}
          </g>
          <path d="M0 860 H1600 V900 H0 Z" fill="#000" opacity="0.4" />

          {/* fountain pen */}
          <g transform="rotate(-8 1220 742)">
            <rect x="1110" y="738" width="200" height="9" rx="4.5" fill="#0d0a08" />
            <rect x="1270" y="738" width="12" height="9" fill="url(#brass)" />
            <path d="M1110 738 L1080 742.5 L1110 747 Z" fill="#c9975a" />
          </g>

          {/* brass lamp, right edge */}
          <g>
            <ellipse cx="1520" cy="640" rx="80" ry="12" fill="url(#brass)" opacity="0.8" />
            <rect x="1512" y="430" width="14" height="210" fill="url(#brass)" />
            <path d="M1430 360 Q1520 300 1610 360 L1600 440 Q1520 460 1440 440 Z" fill="#14281d" />
            <path d="M1430 360 Q1520 300 1610 360" fill="none" stroke="#d9ae6b" strokeOpacity="0.6" strokeWidth="2" />
            <path d="M1440 440 Q1520 460 1600 440" fill="none" stroke="#f0cf8f" strokeOpacity="0.9" strokeWidth="2.5" />
          </g>
        </svg>
      </Layer>
    </>
  );
}

export default function HeroScene({ imageSrc, dim = false }: { imageSrc?: string; dim?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const particles = reduced ? 0 : typeof window !== 'undefined' && window.innerWidth < 768 ? Math.round(PARTICLE_COUNT / 2) : PARTICLE_COUNT;

  // Parallax: mouse (max PARALLAX_STRENGTH px) + scroll, each layer scaled by its depth.
  useEffect(() => {
    const el = root.current;
    if (!el || reduced) return;
    const layers = Array.from(el.querySelectorAll<HTMLElement>('[data-depth]'));
    const movers = layers.map((l) => ({
      depth: Number(l.dataset.depth),
      x: gsap.quickTo(l, 'x', { duration: 1.2, ease: 'power3.out' }),
      y: gsap.quickTo(l, 'yPercent', { duration: 1.2, ease: 'power3.out' }),
    }));
    const fine = window.matchMedia('(pointer: fine)').matches;
    const onMove = (e: PointerEvent) => {
      const px = e.clientX / window.innerWidth - 0.5;
      const py = e.clientY / window.innerHeight - 0.5;
      movers.forEach((m) => { m.x(-px * 2 * PARALLAX_STRENGTH * m.depth); m.y(-py * 0.25 * m.depth); });
    };
    if (fine) window.addEventListener('pointermove', onMove);
    const tweens = layers.map((l) =>
      gsap.to(l, { y: Number(l.dataset.depth) * 90, ease: 'none', scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: true } }),
    );
    return () => {
      window.removeEventListener('pointermove', onMove);
      tweens.forEach((t) => { t.scrollTrigger?.kill(); t.kill(); });
    };
  }, [reduced]);

  useEffect(() => () => ScrollTrigger.refresh(), []);

  return (
    <div ref={root} className="absolute inset-0 overflow-hidden bg-bg" aria-hidden="true">
      {/* 1 · base gradient + golden-hour glow */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(60% 55% at 72% 22%, rgba(232,179,106,0.25), transparent 70%), linear-gradient(180deg, #0b0907 0%, #1a130c 100%)',
      }} />

      {imageSrc ? (
        <Layer depth={0.4}>
          {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied artwork, static export */}
          <img src={imageSrc} alt="" className="h-full w-full object-cover" />
        </Layer>
      ) : (
        <CodedScene />
      )}

      {/* 5 · atmosphere: light rays, lamp glow, dust, legibility gradient, vignette */}
      <div data-depth={0.4} className="absolute inset-0 mix-blend-screen" style={{
        background:
          'linear-gradient(118deg, transparent 38%, rgba(240,194,126,0.10) 46%, transparent 52%), linear-gradient(112deg, transparent 50%, rgba(240,194,126,0.08) 56%, transparent 61%), linear-gradient(124deg, transparent 58%, rgba(240,194,126,0.07) 63%, transparent 69%)',
        filter: 'blur(6px)',
      }} />
      <div className="absolute bottom-[18%] right-[-6%] h-[50vh] w-[30vw] rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(240,190,110,0.35), transparent)', animation: reduced ? undefined : 'lamp-flicker 6s infinite' }} />
      <DustMotes count={particles} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(11,9,7,0.94) 0%, rgba(11,9,7,0.78) 30%, rgba(11,9,7,0.25) 58%, transparent 75%)' }} />
      <div className="absolute inset-x-0 bottom-0 h-40" style={{ background: 'linear-gradient(180deg, transparent, #0b0907)' }} />
      <div className="vignette" />
      {dim && <div className="absolute inset-0 bg-bg/70" />}
    </div>
  );
}
