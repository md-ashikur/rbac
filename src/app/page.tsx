// app/page.tsx
'use client';

import Link from 'next/link';
import Navbar from '@/components/navbar';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-100">
      {/* NAVBAR */}
      <Navbar />

      {/* BODY */}
      <section className="flex flex-col items-center justify-center py-32 px-6 text-center">
        <h1 className="text-5xl font-extrabold text-gray-800 mb-4">Welcome to MyApp</h1>
        <p className="text-lg text-gray-600 max-w-xl">
          A modern RBAC app built with Next.js, Supabase, and Tailwind. Fast, simple, and powerful.
        </p>
        <div className="mt-8">
          <Link href="/dashboard">
            <button className="px-6 py-3 text-white bg-blue-600 rounded-lg hover:bg-blue-700">
              Go to Dashboard
            </button>
          </Link>
        </div>
      </section>
    </main>
  );
}
