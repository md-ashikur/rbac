'use client';

import { useAuth } from './auth-provider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Protected({
  children,
  role,
}: {
  children: React.ReactNode;
  role?: string;
}) {
  const auth = useAuth();
  const user = auth?.user;
  const loading = auth?.loading;
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) router.push('/login');
      else if (role && user.role !== role) router.push('/dashboard');
    }
  }, [role, router, user, loading]);

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600 text-lg">Loading...</div>
      </div>
    );
  }

  return user ? <>{children}</> : null;
}
