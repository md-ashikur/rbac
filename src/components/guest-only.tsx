'use client';

import { useAuth } from './auth-provider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function GuestOnly({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = useAuth();
  const user = auth?.user;
  const loading = auth?.loading;
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      // If user is logged in and not loading, redirect to home page
      router.push('/');
    }
  }, [user, loading, router]);

  // Don't render anything while loading
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-tr from-indigo-900 via-purple-800 to-pink-700 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  // Only render children if user is not logged in
  return !user ? <>{children}</> : null;
}
