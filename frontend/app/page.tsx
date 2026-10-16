'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Hero from '@/components/hero/Hero';
import Navbar from '@/components/hero/Navbar';
import Features from '@/components/sections/Features';
import FaqCta from '@/components/sections/FaqCta';
import Footer from '@/components/sections/Footer';
import HowItWorks from '@/components/sections/HowItWorks';
import Problem from '@/components/sections/Problem';
import SourceBacked from '@/components/sections/SourceBacked';
import UnderTheHood from '@/components/sections/UnderTheHood';
import UseCases from '@/components/sections/UseCases';
import CustomCursor from '@/components/ui/CustomCursor';
import { hasSessionToken } from '@/components/app/AuthProvider';
import { useLenis } from '@/hooks/useLenis';
import { useScrollReveal } from '@/hooks/useScrollReveal';

export default function LandingPage() {
  useLenis();
  useScrollReveal();
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    // Old hash routes from the Vite app (#dboard, #login, …) keep working as bookmarks.
    const hash = window.location.hash.slice(1).split('#')[0];
    if (['dboard', 'dashboard', 'chatbot', 'upload'].includes(hash)) router.replace('/app/');
    else if (hash === 'login') router.replace('/login/');
    setSignedIn(hasSessionToken()); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage is browser-only
  }, [router]);

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-gold focus:px-4 focus:py-2 focus:text-bg">Skip to content</a>
      <Navbar signedIn={signedIn} />
      <main id="main">
        <Hero />
        <Problem />
        <HowItWorks />
        <SourceBacked />
        <Features />
        <UseCases />
        <UnderTheHood />
        <FaqCta />
      </main>
      <Footer />
      <CustomCursor />
    </>
  );
}
