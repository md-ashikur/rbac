-- Create the rbac_users table
CREATE TABLE IF NOT EXISTS public.rbac_users (
  id UUID REFERENCES auth.users ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (id)
);

-- Set up Row Level Security (RLS)
ALTER TABLE public.rbac_users ENABLE ROW LEVEL SECURITY;

-- Create policies for RLS
CREATE POLICY "Users can view their own profile" ON public.rbac_users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.rbac_users
  FOR UPDATE USING (auth.uid() = id);

-- Admin users can view all users
CREATE POLICY "Admins can view all users" ON public.rbac_users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.rbac_users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admin users can update all users
CREATE POLICY "Admins can update all users" ON public.rbac_users
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.rbac_users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admin users can delete users
CREATE POLICY "Admins can delete users" ON public.rbac_users
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.rbac_users 
      WHERE id = auth.uid() AND role = 'admin'
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

-- Insert an admin user (replace with your email)
-- You'll need to change this email to your actual email address
INSERT INTO public.rbac_users (id, email, name, role)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'name', 'Admin User'),
  'admin'
FROM auth.users 
WHERE email = 'your-email@example.com' -- CHANGE THIS TO YOUR EMAIL
ON CONFLICT (id) DO UPDATE SET role = 'admin';
