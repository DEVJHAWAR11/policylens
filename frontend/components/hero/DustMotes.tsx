'use client';

import { useEffect, useRef } from 'react';

// Slow, warm dust drifting through the light. Pauses when the tab is hidden or off-screen.
export default function DustMotes({ count, className = '' }: { count: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || count <= 0) return;
    const ctx = canvas.getContext('2d')!;
    let w = 0, h = 0, raf = 0, running = true, visible = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const motes = Array.from({ length: count }, () => ({
      x: Math.random(), y: Math.random(),
      r: 0.6 + Math.random() * 1.8,
      vx: (Math.random() - 0.3) * 0.00012, vy: -0.00004 - Math.random() * 0.0001,
      a: 0.15 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2,
    }));

    // colour follows the theme (--dust is an "r, g, b" triplet); re-read when it changes
    const root = document.documentElement;
    let dust = getComputedStyle(root).getPropertyValue('--dust').trim() || '250, 222, 170';
    const mo = new MutationObserver(() => { dust = getComputedStyle(root).getPropertyValue('--dust').trim() || dust; });
    mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        m.x += m.vx + Math.sin(t / 3000 + m.phase) * 0.00005;
        m.y += m.vy;
        if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
        if (m.x > 1.02) m.x = -0.02;
        if (m.x < -0.02) m.x = 1.02;
        // brighter in the shaft of light (upper right)
        const lit = Math.max(0, 1 - Math.hypot(m.x - 0.72, m.y - 0.25) * 1.4);
        const alpha = m.a * (0.35 + lit) * (0.7 + 0.3 * Math.sin(t / 900 + m.phase));
        const g = ctx.createRadialGradient(m.x * w, m.y * h, 0, m.x * w, m.y * h, m.r * 3);
        g.addColorStop(0, `rgba(${dust}, ${alpha})`);
        g.addColorStop(1, `rgba(${dust}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(m.x * w, m.y * h, m.r * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = (t: number) => {
      if (!running) return;
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    const start = () => { if (!running && visible && !document.hidden) { running = true; raf = requestAnimationFrame(loop); } };
    const stop = () => { running = false; cancelAnimationFrame(raf); };
    raf = requestAnimationFrame(loop);

    const onVis = () => (document.hidden ? stop() : start());
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop(); });
    io.observe(canvas);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('resize', resize);
    return () => {
      stop();
      mo.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', resize);
    };
  }, [count]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}
