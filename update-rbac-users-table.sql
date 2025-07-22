-- Add missing columns to the existing rbac_users table
ALTER TABLE public.rbac_users 
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user',
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW());

-- Ensure the id column is UUID type
ALTER TABLE public.rbac_users 
ALTER COLUMN id TYPE UUID USING id::UUID;

-- Make email NOT NULL after adding the column
ALTER TABLE public.rbac_users 
ALTER COLUMN email SET NOT NULL;

-- Make role NOT NULL after adding the column
ALTER TABLE public.rbac_users 
ALTER COLUMN role SET NOT NULL;

-- Set up Row Level Security (RLS) if not already enabled
ALTER TABLE public.rbac_users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Users can view their own profile" ON public.rbac_users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.rbac_users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.rbac_users;
DROP POLICY IF EXISTS "Admins can update all users" ON public.rbac_users;
DROP POLICY IF EXISTS "Admins can delete users" ON public.rbac_users;
DROP POLICY IF EXISTS "Allow user registration" ON public.rbac_users;

-- Allow inserts for new user registration (must come first)
CREATE POLICY "Allow user registration" ON public.rbac_users
  FOR INSERT WITH CHECK (auth.uid()::UUID = id::UUID);

-- Create policies for RLS
CREATE POLICY "Users can view their own profile" ON public.rbac_users
  FOR SELECT USING (auth.uid()::UUID = id::UUID);

CREATE POLICY "Users can update their own profile" ON public.rbac_users
  FOR UPDATE USING (auth.uid()::UUID = id::UUID);

-- Admin users can view all users
CREATE POLICY "Admins can view all users" ON public.rbac_users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.rbac_users 
      WHERE id::UUID = auth.uid()::UUID AND role = 'admin'
    )
  );

-- Admin users can update all users
CREATE POLICY "Admins can update all users" ON public.rbac_users
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.rbac_users 
      WHERE id::UUID = auth.uid()::UUID AND role = 'admin'
    )
  );

-- Admin users can delete users
CREATE POLICY "Admins can delete users" ON public.rbac_users
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.rbac_users 
      WHERE id::UUID = auth.uid()::UUID AND role = 'admin'
    )
  );

-- Create a function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.rbac_users (id, email, name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', ''),
    'user'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to automatically create user records
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
