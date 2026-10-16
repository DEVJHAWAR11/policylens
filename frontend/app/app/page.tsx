'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Workspace from '@/components/app/Workspace';
import { hasSessionToken, useAuth } from '@/components/app/AuthProvider';

export default function AppPage() {
  const router = useRouter();
  const { resolving } = useAuth();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (resolving) return;
    if (hasSessionToken()) setAllowed(true); // eslint-disable-line react-hooks/set-state-in-effect -- auth gate reads localStorage
    else router.replace('/login/');
  }, [resolving, router]);

  if (!allowed) {
    return <div className="grid h-[100dvh] place-items-center"><div className="h-px w-40 overflow-hidden bg-line"><div className="h-full w-1/2 shimmer" /></div></div>;
  }
  return <Workspace />;
}
