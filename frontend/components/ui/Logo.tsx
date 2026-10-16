export function ColumnsIcon({ size = 26, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M5 11 16 4.5 27 11" />
      <path d="M6.5 11h19M6.5 25.5h19M4.5 28h23" />
      <path d="M9.5 13.5v9.5M13.8 13.5v9.5M18.2 13.5v9.5M22.5 13.5v9.5" />
    </svg>
  );
}

export default function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 text-cream ${className}`}>
      <ColumnsIcon className="text-gold" />
      <span className="font-display text-[1.6rem] font-semibold leading-none tracking-tight">PolicyLens</span>
    </span>
  );
}
