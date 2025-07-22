'use client';

import React, { useEffect, useState } from 'react';
import { AppUser, Role } from '@/types';
import Navbar from '@/components/navbar';
import Protected from '@/components/protected';
import toast from 'react-hot-toast';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';

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

function getAvailableRoles(currentRole: Role): Role[] {
  if (currentRole === 'super_admin') {
    return ['super_admin', 'admin', 'moderator', 'user'];
  }
  if (currentRole === 'admin') {
    return ['moderator', 'user'];
  }
  if (currentRole === 'moderator') {
    return ['user'];
  }
  return [];
}

const Dashboard = () => {
  const auth = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<Role>('user');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const usersPerPage = 5;

  const fetchUsers = React.useCallback(async () => {
    if (!auth?.user || auth.loading) {
      return; // Don't fetch if user is not authenticated or still loading
    }

    // Only show loading on initial load, not on subsequent updates
    if (users.length === 0) {
      setLoading(true);
    }

    try {
      // Get the current session to pass as authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        console.log('No session found, user might not be authenticated');
        return;
      }
      
      const response = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      const result = await response.json();
      
      if (!response.ok) {
        if (response.status === 401) {
          console.log('Unauthorized - session might be expired');
          return;
        }
        // Only show error toast if it's not just a refresh
        if (users.length === 0) {
          toast.error(result.error || 'Failed to fetch users');
        }
        console.error('Error fetching users:', result.error);
      } else if (result.users) {
        setUsers(result.users);
        setCurrentUserRole(result.currentUserRole);
        console.log('Fetched users:', result.users); // Debug log
      }
    } catch (err) {
      // Only show error toast if it's not just a refresh
      if (users.length === 0) {
        toast.error('An unexpected error occurred');
      }
      console.error('Unexpected error:', err);
    }
    setLoading(false);
  }, [auth?.user, auth?.loading, users.length]);

  useEffect(() => {
    fetchUsers();

    // Set up real-time subscription for rbac_users table
    const subscription = supabase
      .channel('rbac_users_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'rbac_users' 
        }, 
        (payload) => {
          console.log('Real-time update received:', payload);
          
          if (payload.eventType === 'UPDATE') {
            // Update the specific user in the list
            setUsers(prevUsers => 
              prevUsers.map(user => 
                user.id === payload.new.id 
                  ? { ...user, ...payload.new }
                  : user
              )
            );
            
            // If the updated user is the current user, refresh their auth data and role
            if (auth?.user?.id === payload.new.id) {
              console.log('Current user role updated via real-time:', payload.new.role);
              setCurrentUserRole(payload.new.role);
              // Refresh auth context to update session data
              auth?.refreshUser?.();
            }
          } else if (payload.eventType === 'DELETE') {
            // Remove the deleted user from the list
            setUsers(prevUsers => 
              prevUsers.filter(user => user.id !== payload.old.id)
            );
          } else if (payload.eventType === 'INSERT') {
            // Add the new user to the list (type cast for compatibility)
            const newUser = payload.new as AppUser;
            setUsers(prevUsers => [...prevUsers, newUser]);
          }
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    return () => {
      console.log('Unsubscribing from realtime');
      subscription.unsubscribe();
    };
  }, [auth, fetchUsers]);

  const filteredUsers = users
    .filter((u) => u.email.toLowerCase().includes(search.toLowerCase()))
    .filter((u) => (roleFilter ? u.role === roleFilter : true));

  const indexOfLastUser = currentPage * usersPerPage;
  const indexOfFirstUser = indexOfLastUser - usersPerPage;
  const currentUsers = filteredUsers.slice(indexOfFirstUser, indexOfLastUser);

  const handleRoleChange = async (userId: string, newRole: Role) => {
    console.log(`Attempting to change user ${userId} role to ${newRole}`);
    
    // Check if current user has permission to assign this role
    if (!canManageRole(currentUserRole, newRole)) {
      toast.error(`You don't have permission to assign ${newRole} role`);
      return;
    }

    // Prevent changing own role for admins (only super admin can change admin roles)
    if (userId === auth?.user?.id && currentUserRole === 'admin' && newRole !== 'admin') {
      toast.error('Admins cannot change their own role');
      return;
    }

    // Optimistic update - update UI immediately
    const previousUsers = users;
    const previousRole = currentUserRole;
    
    setUsers(prevUsers => 
      prevUsers.map(user => 
        user.id === userId 
          ? { ...user, role: newRole }
          : user
      )
    );

    // If the current user's role is being changed, update it immediately
    if (auth?.user?.id === userId) {
      setCurrentUserRole(newRole);
    }

    try {
      // Get fresh session to ensure we have a valid token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        throw new Error('No valid session found');
      }

      console.log('Making API call to update role...');
      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId, role: newRole }),
      });
      
      const result = await response.json();
      console.log('API response:', { status: response.status, result });
      
      if (!response.ok) {
        console.error('API error:', result);
        // Revert optimistic updates on error
        setUsers(previousUsers);
        setCurrentUserRole(previousRole);
        toast.error(result.error || 'Failed to update user role');
      } else {
        console.log('Role updated successfully');
        toast.success('User role updated successfully');
        
        // If the current user's role was changed, refresh their auth data immediately
        if (auth?.user?.id === userId) {
          console.log('Refreshing current user auth data...');
          await auth?.refreshUser?.();
        }
        
        // Force a fresh fetch to ensure consistency
        setTimeout(() => {
          fetchUsers();
        }, 500);
      }
    } catch (err) {
      console.error('Error updating role:', err);
      // Revert optimistic updates on error
      setUsers(previousUsers);
      setCurrentUserRole(previousRole);
      toast.error('An unexpected error occurred');
    }
  };

  const handleDelete = async (userId: string) => {
    try {
      // Get the current session to pass as authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        toast.error(result.error || 'Failed to delete user');
        console.error('Error deleting user:', result.error);
      } else {
        toast.success('User deleted successfully');
        setDeleteConfirm(null);
        // Real-time subscription will handle the refresh automatically
      }
    } catch (err) {
      toast.error('An unexpected error occurred');
      console.error('Unexpected error:', err);
    }
  };

  return (
    <Protected>
      <div className="min-h-screen bg-gray-100">
        <Navbar />
        <div className="max-w-6xl mx-auto p-6">
          <h1 className="text-3xl font-bold mb-6 text-gray-800">
            {currentUserRole === 'super_admin' ? 'Super Admin' : 
             currentUserRole === 'admin' ? 'Admin' : 
             currentUserRole === 'moderator' ? 'Moderator' : 'User'} Dashboard
          </h1>

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <input
              type="text"
              placeholder="Search by email..."
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <select
              value={roleFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRoleFilter(e.target.value as Role | '')}
              className="px-4 py-2 bg-blue-500 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Roles</option>
              <option value="super_admin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="moderator">Moderator</option>
              <option value="user">User</option>
            </select>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-8">
              <div className="text-gray-600">Loading users...</div>
            </div>
          )}

          {/* Users List */}
          {!loading && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {currentUsers.map((user) => (
                      <tr key={user.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <div className="text-sm font-medium text-gray-900">
                              {user.name || 'No name'}
                            </div>
                            <div className="text-sm text-gray-500">{user.email}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            user.role === 'super_admin'
                              ? 'bg-purple-100 text-purple-800'
                              : user.role === 'admin' 
                              ? 'bg-red-100 text-red-800'
                              : user.role === 'moderator'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {user.role === 'super_admin' ? 'Super Admin' : 
                             user.role === 'admin' ? 'Admin' :
                             user.role === 'moderator' ? 'Moderator' : 'User'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            {/* Super Admin can change any role */}
                            {currentUserRole === 'super_admin' && (
                              <select
                                value={user.role}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => 
                                  handleRoleChange(user.id, e.target.value as Role)
                                }
                                className="px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                                disabled={user.id === auth?.user?.id} // Can't change own role
                              >
                                <option value="super_admin">Super Admin</option>
                                <option value="admin">Admin</option>
                                <option value="moderator">Moderator</option>
                                <option value="user">User</option>
                              </select>
                            )}

                            {/* Admins can change roles except super admin and other admins */}
                            {currentUserRole === 'admin' && (
                              <select
                                value={user.role}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => 
                                  handleRoleChange(user.id, e.target.value as Role)
                                }
                                className="px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                                disabled={user.role === 'super_admin' || (user.role === 'admin' && user.id !== auth?.user?.id)}
                              >
                                <option value="super_admin" disabled>Super Admin</option>
                                <option value="admin" disabled={user.id !== auth?.user?.id}>Admin</option>
                                <option value="moderator">Moderator</option>
                                <option value="user">User</option>
                              </select>
                            )}
                            
                            {/* Moderators can only change user roles */}
                            {currentUserRole === 'moderator' && (
                              <select
                                value={user.role}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => 
                                  handleRoleChange(user.id, e.target.value as Role)
                                }
                                className="px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                                disabled={user.role !== 'user'}
                              >
                                <option value="super_admin" disabled>Super Admin</option>
                                <option value="admin" disabled>Admin</option>
                                <option value="moderator" disabled>Moderator</option>
                                <option value="user">User</option>
                              </select>
                            )}
                            
                            {/* Regular users can only view roles */}
                            {currentUserRole === 'user' && (
                              <span className="px-3 py-1 text-sm text-gray-600">
                                View Only
                              </span>
                            )}
                            
                            {/* Super Admin and Admin can delete users (with restrictions) */}
                            {(currentUserRole === 'super_admin' || currentUserRole === 'admin') && 
                             canManageRole(currentUserRole, user.role) && 
                             user.id !== auth?.user?.id && (
                              <button
                                onClick={() => setDeleteConfirm(user.id)}
                                className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors"
                                disabled={
                                  (currentUserRole === 'admin' && (user.role === 'super_admin' || user.role === 'admin')) ||
                                  user.id === auth?.user?.id
                                }
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* No Results */}
          {!loading && currentUsers.length === 0 && (
            <div className="text-center py-8 bg-white rounded-lg shadow">
              <div className="text-gray-500">No users found</div>
            </div>
          )}

          {/* Pagination */}
          {filteredUsers.length > usersPerPage && (
            <div className="mt-6 flex justify-center gap-2">
              {Array.from({ length: Math.ceil(filteredUsers.length / usersPerPage) }, (_, i) => (
                <button
                  key={i + 1}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    currentPage === i + 1
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">Confirm Delete</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete this user? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
    </Protected>
  );
};

export default Dashboard;

