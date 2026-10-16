import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, JetBrains_Mono, Manrope } from 'next/font/google';
import { AuthProvider } from '@/components/app/AuthProvider';
import ConnectionBanner from '@/components/ui/ConnectionBanner';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import './globals.css';

const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600', '700'], style: ['normal', 'italic'], variable: '--font-cormorant', display: 'swap' });
const manrope = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-manrope', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: 'PolicyLens — Complex policies, clear answers',
  description: 'Upload an insurance or policy PDF, ask in plain English, and get answers backed by the exact clause and page.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0907' },
    { media: '(prefers-color-scheme: light)', color: '#f5eee2' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is set by THEME_INIT_SCRIPT before paint, so React must not complain about it
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${cormorant.variable} ${manrope.variable} ${jetbrains.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ConnectionBanner />
        <AuthProvider>{children}</AuthProvider>
        <div className="grain" aria-hidden="true" />
      </body>
    </html>
  );
}
