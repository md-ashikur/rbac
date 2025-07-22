import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

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

// Helper function to verify user authentication
async function verifyAuth(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;

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
    return !!user;
  } catch {
    return false;
  }
}

// GET - Fetch user's specific permissions only
export async function GET(request: NextRequest) {
  try {
    const isAuthenticated = await verifyAuth(request);
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    // Get user's current permissions with optimized query
    const { data: userPermissions, error } = await supabaseAdmin
      .from('user_permissions')
      .select(`
        permission_id,
        granted_by,
        granted_at,
        permissions!inner (
          name,
          description,
          category
        )
      `)
      .eq('user_id', userId);

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch user permissions' }, { status: 500 });
    }

    return NextResponse.json({
      userPermissions: userPermissions || []
    });
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
