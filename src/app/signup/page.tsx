'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import GuestOnly from '@/components/guest-only';

type FormData = {
  name: string;
  email: string;
  password: string;
};

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            name: data.name,
          },
        },
      });
      
      if (error) {
        toast.error(error.message);
      } else if (authData.user) {
        // Create user record in the rbac_users table
        const { error: dbError } = await supabase
          .from('rbac_users')
          .insert([
            {
              id: authData.user.id,
              email: authData.user.email,
              name: data.name,
              role: 'user', // Default role
            },
          ]);
          
        if (dbError) {
          console.error('Error creating user record:', dbError);
          toast.error('Failed to create user profile');
        } else {
          console.log('User record created successfully');
        }
        
        toast.success('Check your email to confirm your account');
      }
    } catch (err) {
      toast.error('An unexpected error occurred');
      console.error('Signup error:', err);
    }
    setLoading(false);
  };

  return (
    <GuestOnly>
      <div className="min-h-screen bg-gradient-to-tr from-indigo-900 via-purple-800 to-pink-700 flex items-center justify-center px-4">
      <div className="w-full max-w-md p-8 bg-white/10 backdrop-blur-md rounded-2xl shadow-xl text-white">
        <h2 className="text-3xl font-bold text-center mb-6">Sign Up</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input
            type="text"
            placeholder="Full Name"
            {...register('name', { required: 'Name is required' })}
            className="w-full px-4 py-3 rounded-xl bg-white/20 placeholder-white text-white focus:ring-2 focus:ring-indigo-400"
          />
          {errors.name && <p className="text-sm text-red-300">{errors.name.message}</p>}

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
            {...register('password', {
              required: 'Password is required',
              minLength: { value: 6, message: 'Minimum 6 characters' },
            })}
            className="w-full px-4 py-3 rounded-xl bg-white/20 placeholder-white text-white focus:ring-2 focus:ring-indigo-400"
          />
          {errors.password && <p className="text-sm text-red-300">{errors.password.message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-500 hover:bg-indigo-600 transition duration-300 py-3 rounded-xl font-semibold"
          >
            {loading ? 'Signing up...' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          Already have an account?{' '}
          <Link href="/login" className="text-indigo-300 hover:text-white">
            Login
          </Link>
        </div>
      </div>
    </div>
    </GuestOnly>
  );
}
