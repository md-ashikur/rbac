'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

type FormData = {
  password: string;
  confirmPassword: string;
};

export default function ResetPasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<FormData>();

  const password = watch('password');

  useEffect(() => {
    // Check if user came from a valid reset link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User is in password recovery mode
        toast.success('Please enter your new password');
      } else if (event === 'SIGNED_IN' && session) {
        // Password was successfully updated
        toast.success('Password updated successfully!');
        router.push('/');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const onSubmit = async (data: FormData) => {
    if (data.password !== data.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });

      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Password updated successfully!');
        router.push('/');
      }
    } catch {
      toast.error('An unexpected error occurred');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-tr from-indigo-900 via-purple-800 to-pink-700 flex items-center justify-center px-4">
      <div className="w-full max-w-md p-8 bg-white/10 backdrop-blur-md rounded-2xl shadow-xl text-white">
        <h2 className="text-3xl font-bold text-center mb-6">Reset Password</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input
            type="password"
            placeholder="New Password"
            {...register('password', {
              required: 'Password is required',
              minLength: { value: 6, message: 'Minimum 6 characters' },
            })}
            className="w-full px-4 py-3 rounded-xl bg-white/20 placeholder-white text-white focus:ring-2 focus:ring-indigo-400"
          />
          {errors.password && <p className="text-sm text-red-300">{errors.password.message}</p>}

          <input
            type="password"
            placeholder="Confirm New Password"
            {...register('confirmPassword', {
              required: 'Please confirm your password',
              validate: (value) => value === password || 'Passwords do not match',
            })}
            className="w-full px-4 py-3 rounded-xl bg-white/20 placeholder-white text-white focus:ring-2 focus:ring-indigo-400"
          />
          {errors.confirmPassword && <p className="text-sm text-red-300">{errors.confirmPassword.message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-500 hover:bg-indigo-600 transition duration-300 py-3 rounded-xl font-semibold"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
