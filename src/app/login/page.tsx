'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import GuestOnly from '@/components/guest-only';

type FormData = {
  email: string;
  password: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword(data);
      if (error) {
        toast.error(error.message);
        setLoading(false);
      } else {
        toast.success('Logged in successfully!');
        // Small delay to show success message, then redirect
        setTimeout(() => {
          router.push('/');
        }, 1000);
      }
    } catch {
      toast.error('An unexpected error occurred');
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const email = getValues('email');
    if (!email) {
      toast.error('Please enter your email address first');
      return;
    }

    setForgotPasswordLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Password reset email sent! Check your inbox.');
      }
    } catch {
      toast.error('An unexpected error occurred');
    }
    setForgotPasswordLoading(false);
  };

  return (
    <GuestOnly>
      <div className="min-h-screen bg-gradient-to-tr from-indigo-900 via-purple-800 to-pink-700 flex items-center justify-center px-4">
      <div className="w-full max-w-md p-8 bg-white/10 backdrop-blur-md rounded-2xl shadow-xl text-white">
        <h2 className="text-3xl font-bold text-center mb-6">Login</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            {...register('email', { required: 'Email is required' })}
            className="w-full px-4 py-3 rounded-xl bg-white/20 placeholder-white text-white focus:ring-2 focus:ring-indigo-400"
          />
          {errors.email && <p className="text-sm text-red-300">{errors.email.message}</p>}

          <input
            type="password"
            placeholder="Password"
            {...register('password', { required: 'Password is required' })}
            className="w-full px-4 py-3 rounded-xl bg-white/20 placeholder-white text-white focus:ring-2 focus:ring-indigo-400"
          />
          {errors.password && <p className="text-sm text-red-300">{errors.password.message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-500 hover:bg-indigo-600 transition duration-300 py-3 rounded-xl font-semibold"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>

          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={forgotPasswordLoading}
            className="w-full text-sm text-indigo-300 hover:text-white underline disabled:opacity-50"
          >
            {forgotPasswordLoading ? 'Sending...' : 'Forgot Password?'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          Don’t have an account?{' '}
          <Link href="/signup" className="text-indigo-300 hover:text-white">
            Sign up
          </Link>
        </div>
      </div>
    </div>
    </GuestOnly>
  );
}
