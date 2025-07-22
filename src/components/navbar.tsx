'use client';

import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useAuth } from './auth-provider';
import toast from 'react-hot-toast';

export default function Navbar() {
  const auth = useAuth();
  const user = auth?.user;
  const loading = auth?.loading;

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success('Logged out successfully!');
    } catch {
      toast.error('Error logging out');
    }
  };

  return (
    <nav className="flex items-center justify-between px-4 py-3 bg-white shadow-md">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-xl font-bold text-blue-600">🌐 MyApp</Link>

        {/* Profile Section */}
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-700">
            {loading ? 'Loading...' : user ? `Hello, ${user.name || user.email}` : 'Guest'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {loading ? (
          <div className="px-4 py-2 text-sm text-gray-500">Loading...</div>
        ) : user ? (
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded hover:bg-red-600"
          >
            Logout
          </button>
        ) : (
          <>
            <Link href="/login" className="text-sm text-gray-700 hover:underline">
              Sign In
            </Link>
            <Link href="/signup" className="px-4 py-2 text-sm text-white bg-blue-500 rounded hover:bg-blue-600">
              Sign Up
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
