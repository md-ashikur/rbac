import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { Role, Permission } from '@/types';

// Create a Supabase client with service role key to bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: {
      schema: 'public'
    }
  }
);

// Permission checking functions
const rolePermissions: Record<Role, string[]> = {
  super_admin: ['*'], // All permissions
  admin: [
    'view_users', 'create_users', 'edit_users', 'delete_users',
    'view_roles', 'assign_user_role', 'assign_moderator_role',
    'view_permissions', 'grant_permissions', 'revoke_permissions',
    'manage_moderator_permissions', 'access_admin_panel'
  ],
  moderator: [
    'view_users', 'edit_users',
    'view_roles', 'assign_user_role',
    'view_permissions', 'access_moderator_panel'
  ],
  user: ['view_users', 'view_roles']
};

function hasPermission(userRole: Role, permission: string): boolean {
  if (userRole === 'super_admin') return true;
  return rolePermissions[userRole]?.includes(permission) || false;
}

function canManageRole(currentRole: Role, targetRole: Role): boolean {
  if (currentRole === 'super_admin') return true;
  if (currentRole === 'admin') {
    return targetRole !== 'super_admin' && targetRole !== 'admin';
  }
  if (currentRole === 'moderator') {
    return targetRole === 'user';
  }
  return false;
}

// Helper function to get current user's role and permissions
async function getCurrentUserRole(request: NextRequest): Promise<{ userId: string; role: string } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;

  try {
    const token = authHeader.replace('Bearer ', '');
    
    // Create a supabase client with the auth token
    const supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );
    
    const { data: { user } } = await supabaseClient.auth.getUser(token);
    
    if (!user) return null;

    // Use admin client to get user role (bypass RLS)
    const { data: userData } = await supabaseAdmin
      .from('rbac_users')
      .select('role')
      .eq('id', user.id)
      .single();

    return userData ? { userId: user.id, role: userData.role } : null;
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserRole(request);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { role } = currentUser;

    // Check if user has permission to view users
    if (!hasPermission(role as Role, 'view_users')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let users;

    if (role === 'super_admin' || role === 'admin' || role === 'moderator') {
      // Super admin, admin and moderator can see all users
      const { data, error } = await supabaseAdmin
        .from('rbac_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      users = data;
    } else if (role === 'user') {
      // Regular users can only see admins, moderators, and super admins
      const { data, error } = await supabaseAdmin
        .from('rbac_users')
        .select('*')
        .in('role', ['super_admin', 'admin', 'moderator'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      users = data;
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ users, currentUserRole: role });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    console.log('PUT request received');
    
    // Test service role connection
    const { error: testError } = await supabaseAdmin
      .from('rbac_users')
      .select('count')
      .limit(1);
    
    if (testError) {
      console.error('Service role test failed:', testError);
      return NextResponse.json({ error: 'Service role configuration error: ' + testError.message }, { status: 500 });
    }
    
    console.log('Service role connection successful');

    const currentUser = await getCurrentUserRole(request);
    if (!currentUser) {
      console.log('No current user found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Current user:', currentUser);

    const { userId, role } = await request.json();
    console.log('Request data:', { userId, role });

    if (!userId || !role) {
      return NextResponse.json({ error: 'Missing userId or role' }, { status: 400 });
    }

    // Validate role
    if (!['super_admin', 'admin', 'moderator', 'user'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Check if current user can manage the target role
    if (!canManageRole(currentUser.role as Role, role as Role)) {
      console.log(`User ${currentUser.role} cannot assign role ${role}`);
      return NextResponse.json({ 
        error: `You don't have permission to assign ${role} role` 
      }, { status: 403 });
    }

    // Get target user's current role to prevent self-demotion for admins
    const { data: targetUser } = await supabaseAdmin
      .from('rbac_users')
      .select('role')
      .eq('id', userId)
      .single();

    if (targetUser && targetUser.role === 'admin' && currentUser.role === 'admin' && currentUser.userId === userId) {
      return NextResponse.json({ 
        error: 'Admins cannot change their own role' 
      }, { status: 403 });
    }

    console.log(`User ${currentUser.userId} (${currentUser.role}) updating user ${userId} role to ${role}`);

    // Update user role using service role (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from('rbac_users')
      .update({ 
        role,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select('*');

    if (error) {
      console.error('Database error updating user role:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      console.error('No data returned from update - user might not exist');
      return NextResponse.json({ error: 'User not found or update failed' }, { status: 404 });
    }

    console.log('User role updated successfully:', data[0]);
    return NextResponse.json({ success: true, user: data[0] });
  } catch (error) {
    console.error('Unexpected error in PUT:', error);
    return NextResponse.json({ error: 'Internal server error: ' + (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserRole(request);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has permission to delete users
    if (!hasPermission(currentUser.role as Role, 'delete_users')) {
      return NextResponse.json({ error: 'You don\'t have permission to delete users' }, { status: 403 });
    }

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Prevent user from deleting themselves
    if (userId === currentUser.userId) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    // Get target user's role to check if deletion is allowed
    const { data: targetUser } = await supabaseAdmin
      .from('rbac_users')
      .select('role')
      .eq('id', userId)
      .single();

    if (targetUser && !canManageRole(currentUser.role as Role, targetUser.role as Role)) {
      return NextResponse.json({ 
        error: `You don't have permission to delete ${targetUser.role}s` 
      }, { status: 403 });
    }

    // Delete user from rbac_users table using service role (bypasses RLS)
    const { error: dbError } = await supabaseAdmin
      .from('rbac_users')
      .delete()
      .eq('id', userId);

    if (dbError) {
      console.error('Error deleting user from rbac_users:', dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    // Delete user from Supabase Auth using admin client
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authError) {
      console.error('Error deleting user from auth:', authError);
      // If auth deletion fails, we should restore the user in rbac_users
      // For now, we'll just log the error and continue
      console.warn('User deleted from rbac_users but failed to delete from auth:', authError.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
