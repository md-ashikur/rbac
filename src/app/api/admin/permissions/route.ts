import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@/types';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Helper function to get current user's role
async function getCurrentUserRole(request: NextRequest): Promise<{ userId: string; role: string } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;

  try {
    const token = authHeader.replace('Bearer ', '');
    
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

// GET - Fetch user permissions
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserRole(request);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    // Get all permissions
    const { data: allPermissions, error: permError } = await supabaseAdmin
      .from('permissions')
      .select('*')
      .order('category', { ascending: true });

    if (permError) {
      return NextResponse.json({ error: permError.message }, { status: 500 });
    }

    // Get user's current permissions
    const { data: userPermissions, error: userPermError } = await supabaseAdmin
      .from('user_permissions')
      .select(`
        permission_id,
        granted_by,
        granted_at,
        permissions (
          name,
          description,
          category
        )
      `)
      .eq('user_id', userId);

    if (userPermError) {
      return NextResponse.json({ error: userPermError.message }, { status: 500 });
    }

    return NextResponse.json({
      allPermissions,
      userPermissions: userPermissions || []
    });
  } catch (error) {
    console.error('Error fetching permissions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Grant permission to user
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserRole(request);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only super admin can grant permissions
    if (currentUser.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admin can grant permissions' }, { status: 403 });
    }

    const { userId, permissionId } = await request.json();

    if (!userId || !permissionId) {
      return NextResponse.json({ error: 'Missing userId or permissionId' }, { status: 400 });
    }

    // Grant permission
    const { data, error } = await supabaseAdmin
      .from('user_permissions')
      .insert({
        user_id: userId,
        permission_id: permissionId,
        granted_by: currentUser.userId
      })
      .select();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        return NextResponse.json({ error: 'Permission already granted' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error granting permission:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Revoke permission from user
export async function DELETE(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserRole(request);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only super admin can revoke permissions
    if (currentUser.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only super admin can revoke permissions' }, { status: 403 });
    }

    const { userId, permissionId } = await request.json();

    if (!userId || !permissionId) {
      return NextResponse.json({ error: 'Missing userId or permissionId' }, { status: 400 });
    }

    // Revoke permission
    const { error } = await supabaseAdmin
      .from('user_permissions')
      .delete()
      .eq('user_id', userId)
      .eq('permission_id', permissionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error revoking permission:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
