import type { NextConfig } from 'next';
import path from 'node:path';

// Static export: Render serves `out/` as a static site, exactly like the old Vite build.
// The VITE_* names are kept so the existing Render / .env variables keep working.
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: { root: path.resolve(__dirname) },
  reactStrictMode: false, // upload effects must not double-fire in dev (one file = one upload)
  env: {
    NEXT_PUBLIC_API_URL: process.env.VITE_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '',
    NEXT_PUBLIC_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  },
};

export default nextConfig;
