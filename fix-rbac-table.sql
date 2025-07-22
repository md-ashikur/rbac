-- Run the fix-infinite-recursion.sql script first to set up the table properly
-- Then run this script to create the first admin user

-- Create an admin user (replace with your actual user ID and email)
-- You can get your user ID from the Supabase Auth > Users section
INSERT INTO public.rbac_users (id, email, name, role, created_at, updated_at)
VALUES (
  '041f708b-7e66-49e8-a75b-c63fae44bcb7', -- Replace with your actual user ID
  'ashik76690@gmail.com', -- Replace with your actual email
  'Md. Ashikur Rahman', -- Replace with your actual name
  'admin',
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET 
  role = 'admin',
  updated_at = NOW();

-- Verify the admin user was created
SELECT id, email, name, role, created_at FROM public.rbac_users WHERE role = 'admin';