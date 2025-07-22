-- Enhanced RBAC System with Granular Permissions
-- This creates a comprehensive permission-based access control system

-- Step 1: Create permissions table
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('user_management', 'role_management', 'permission_management', 'system')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Step 2: Create user_permissions junction table
CREATE TABLE IF NOT EXISTS public.user_permissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    granted_by UUID NOT NULL REFERENCES auth.users(id),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    UNIQUE(user_id, permission_id)
);

-- Step 3: Update rbac_users table to include super_admin role
ALTER TABLE public.rbac_users 
DROP CONSTRAINT IF EXISTS rbac_users_role_check;

ALTER TABLE public.rbac_users 
ADD CONSTRAINT rbac_users_role_check 
CHECK (role IN ('super_admin', 'admin', 'moderator', 'user'));

-- Step 4: Insert default permissions
INSERT INTO public.permissions (name, description, category) VALUES
-- User Management
('view_users', 'Can view list of users', 'user_management'),
('create_users', 'Can create new users', 'user_management'),
('edit_users', 'Can edit user information', 'user_management'),
('delete_users', 'Can delete users', 'user_management'),

-- Role Management
('view_roles', 'Can view user roles', 'role_management'),
('assign_user_role', 'Can assign user role to users', 'role_management'),
('assign_moderator_role', 'Can assign moderator role to users', 'role_management'),
('assign_admin_role', 'Can assign admin role to users', 'role_management'),
('assign_super_admin_role', 'Can assign super admin role (super admin only)', 'role_management'),

-- Permission Management
('view_permissions', 'Can view all permissions', 'permission_management'),
('grant_permissions', 'Can grant permissions to users', 'permission_management'),
('revoke_permissions', 'Can revoke permissions from users', 'permission_management'),
('manage_admin_permissions', 'Can manage admin permissions', 'permission_management'),
('manage_moderator_permissions', 'Can manage moderator permissions', 'permission_management'),

-- System
('access_admin_panel', 'Can access admin dashboard', 'system'),
('access_moderator_panel', 'Can access moderator features', 'system'),
('system_settings', 'Can modify system settings', 'system')
ON CONFLICT (name) DO NOTHING;

-- Step 5: Grant permissions to service role
GRANT ALL ON public.permissions TO service_role;
GRANT ALL ON public.user_permissions TO service_role;

-- Step 6: Set up RLS for permissions table
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permissions_readable_by_authenticated" ON public.permissions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "permissions_manageable_by_service" ON public.permissions
    FOR ALL TO service_role USING (true);

-- Step 7: Set up RLS for user_permissions table
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_permissions_readable_by_authenticated" ON public.user_permissions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "user_permissions_manageable_by_service" ON public.user_permissions
    FOR ALL TO service_role USING (true);

-- Step 8: Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.permissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_permissions;

-- Step 9: Create function to get user permissions
CREATE OR REPLACE FUNCTION public.get_user_permissions(user_uuid UUID)
RETURNS TABLE (
    permission_name TEXT,
    permission_description TEXT,
    permission_category TEXT,
    granted_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.name,
        p.description,
        p.category,
        up.granted_at
    FROM public.user_permissions up
    JOIN public.permissions p ON up.permission_id = p.id
    WHERE up.user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 10: Create function to check if user has permission
CREATE OR REPLACE FUNCTION public.user_has_permission(user_uuid UUID, permission_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.user_permissions up
        JOIN public.permissions p ON up.permission_id = p.id
        WHERE up.user_id = user_uuid 
        AND p.name = permission_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 11: Grant default permissions based on roles
-- This will be handled by the application logic for flexibility

SELECT 'Enhanced RBAC system with permissions created successfully!' as status;
