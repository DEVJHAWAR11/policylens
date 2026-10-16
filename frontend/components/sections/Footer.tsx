import Link from 'next/link';
import Logo from '@/components/ui/Logo';

const COLS = [
  { title: 'Product', links: [['Features', '/#features'], ['How it works', '/#how'], ['Use cases', '/#use-cases'], ['FAQ', '/#faq']] },
  { title: 'Workspace', links: [['Sign in', '/login/'], ['Create account', '/login/?mode=signup'], ['Open workspace', '/app/']] },
  { title: 'Technical', links: [['Under the hood', '/#under-the-hood'], ['Source on GitHub', 'https://github.com/DEVJHAWAR11/policylens']] },
];

export default function Footer() {
  return (
    <footer className="relative border-t border-line px-4 pb-10 pt-16 sm:px-8">
      <div className="hairline absolute inset-x-0 top-0" aria-hidden />
      <div className="mx-auto grid max-w-[1320px] gap-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-muted">Complex policies, clear answers — backed by the exact clause and page.</p>
        </div>
        {COLS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-gold">{c.title}</h3>
            <ul className="mt-4 space-y-2.5 text-[14px]">
              {c.links.map(([label, href]) => (
                <li key={label}>
                  {href.startsWith('http')
                    ? <a href={href} target="_blank" rel="noreferrer" className="text-cream/75 transition-colors hover:text-gold-bright">{label}</a>
                    : <Link href={href} className="text-cream/75 transition-colors hover:text-gold-bright">{label}</Link>}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto mt-14 flex max-w-[1320px] flex-col gap-3 border-t border-line pt-6 text-[12.5px] text-muted sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} PolicyLens</p>
        <p>PolicyLens explains documents; it is not legal or insurance advice.</p>
      </div>
    </footer>
  );
}
