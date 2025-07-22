-- Fix infinite recursion in RLS policies
-- This script will create simple, non-recursive policies

-- Step 1: Disable RLS temporarily
ALTER TABLE public.rbac_users DISABLE ROW LEVEL SECURITY;

-- Step 2: Drop ALL existing policies to remove recursion
DROP POLICY IF EXISTS "Users can view their own profile" ON public.rbac_users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.rbac_users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.rbac_users;
DROP POLICY IF EXISTS "Admins can update all users" ON public.rbac_users;
DROP POLICY IF EXISTS "Admins can delete users" ON public.rbac_users;
DROP POLICY IF EXISTS "Allow user registration" ON public.rbac_users;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.rbac_users;

-- Step 3: Add missing columns if they don't exist
ALTER TABLE public.rbac_users 
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user',
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW());

-- Step 4: Ensure the id column is UUID type
ALTER TABLE public.rbac_users 
ALTER COLUMN id TYPE UUID USING id::UUID;

-- Step 5: Handle any NULL values
UPDATE public.rbac_users SET 
  email = COALESCE(email, 'unknown@example.com'),
  name = COALESCE(name, 'Unknown User'),
  role = COALESCE(role, 'user')
WHERE email IS NULL OR name IS NULL OR role IS NULL;

-- Step 6: Make required columns NOT NULL
ALTER TABLE public.rbac_users 
ALTER COLUMN email SET NOT NULL,
ALTER COLUMN role SET NOT NULL;

-- Step 7: Re-enable RLS
ALTER TABLE public.rbac_users ENABLE ROW LEVEL SECURITY;

-- Step 8: Create SIMPLE, NON-RECURSIVE policies

-- Allow users to view their own profile only
CREATE POLICY "view_own_profile" ON public.rbac_users
  FOR SELECT USING (auth.uid() = id);

-- Allow users to update their own profile only  
CREATE POLICY "update_own_profile" ON public.rbac_users
  FOR UPDATE USING (auth.uid() = id);

-- Allow new user registration
CREATE POLICY "allow_insert" ON public.rbac_users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- For admin operations, we'll handle permissions in the application layer
-- This avoids recursive policy checks

-- Grant usage on the table to authenticated users
GRANT ALL ON public.rbac_users TO authenticated;
GRANT ALL ON public.rbac_users TO anon;
