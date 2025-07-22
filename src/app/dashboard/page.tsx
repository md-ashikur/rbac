'use client';

import React, { useEffect, useState } from 'react';
import { AppUser, Role, Permission } from '@/types';
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

interface UserPermission {
  permission_id: string;
  granted_by: string;
  granted_at: string;
  permissions: {
    name: string;
    description: string;
    category: string;
  };
}

interface ExtendedUser extends AppUser {
  userPermissions?: UserPermission[];
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
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [showPermissions, setShowPermissions] = useState(false);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'permissions'>('users');
  const usersPerPage = 5;

  const fetchUsers = React.useCallback(async () => {
    if (!auth?.user || auth.loading) {
      return;
    }

    if (users.length === 0) {
      setLoading(true);
    }

    try {
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
        if (users.length === 0) {
          toast.error(result.error || 'Failed to fetch users');
        }
        console.error('Error fetching users:', result.error);
      } else if (result.users) {
        setUsers(result.users);
        setCurrentUserRole(result.currentUserRole);
      }
    } catch (err) {
      if (users.length === 0) {
        toast.error('An unexpected error occurred');
      }
      console.error('Unexpected error:', err);
    }
    setLoading(false);
  }, [auth?.user, auth?.loading, users.length]);

  const fetchUserPermissions = async (userId: string) => {
    setPermissionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`/api/admin/permissions?userId=${userId}`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setAllPermissions(result.allPermissions || []);
        setUserPermissions(result.userPermissions || []);
      } else {
        toast.error(result.error || 'Failed to fetch permissions');
      }
    } catch (err) {
      toast.error('Failed to fetch permissions');
      console.error('Error fetching permissions:', err);
    }
    setPermissionLoading(false);
  };

  const handlePermissionChange = async (userId: string, permissionId: string, granted: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/admin/permissions', {
        method: granted ? 'POST' : 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId, permissionId }),
      });
      
      const result = await response.json();
      
      if (response.ok) {
        toast.success(`Permission ${granted ? 'granted' : 'revoked'} successfully`);
        // Refresh permissions
        await fetchUserPermissions(userId);
      } else {
        toast.error(result.error || `Failed to ${granted ? 'grant' : 'revoke'} permission`);
      }
    } catch (err) {
      toast.error('An unexpected error occurred');
      console.error('Error updating permission:', err);
    }
  };

  useEffect(() => {
    fetchUsers();

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
            setUsers(prevUsers => 
              prevUsers.map(user => 
                user.id === payload.new.id 
                  ? { ...user, ...payload.new }
                  : user
              )
            );
            
            if (auth?.user?.id === payload.new.id) {
              console.log('Current user role updated via real-time:', payload.new.role);
              setCurrentUserRole(payload.new.role);
              auth?.refreshUser?.();
            }
          } else if (payload.eventType === 'DELETE') {
            setUsers(prevUsers => 
              prevUsers.filter(user => user.id !== payload.old.id)
            );
          } else if (payload.eventType === 'INSERT') {
            const newUser = payload.new as AppUser;
            setUsers(prevUsers => [...prevUsers, newUser]);
          }
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    return () => {
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
    
    if (!canManageRole(currentUserRole, newRole)) {
      toast.error(`You don't have permission to assign ${newRole} role`);
      return;
    }

    if (userId === auth?.user?.id && currentUserRole === 'admin' && newRole !== 'admin') {
      toast.error('Admins cannot change their own role');
      return;
    }

    const previousUsers = users;
    const previousRole = currentUserRole;
    
    setUsers(prevUsers => 
      prevUsers.map(user => 
        user.id === userId 
          ? { ...user, role: newRole }
          : user
      )
    );

    if (auth?.user?.id === userId) {
      setCurrentUserRole(newRole);
    }

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        throw new Error('No valid session found');
      }

      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId, role: newRole }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        setUsers(previousUsers);
        setCurrentUserRole(previousRole);
        toast.error(result.error || 'Failed to update user role');
      } else {
        toast.success('User role updated successfully');
        
        if (auth?.user?.id === userId) {
          await auth?.refreshUser?.();
        }
        
        setTimeout(() => {
          fetchUsers();
        }, 500);
      }
    } catch (err) {
      setUsers(previousUsers);
      setCurrentUserRole(previousRole);
      toast.error('An unexpected error occurred');
    }
  };

  const handleDelete = async (userId: string) => {
    try {
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
      } else {
        toast.success('User deleted successfully');
        setDeleteConfirm(null);
      }
    } catch (err) {
      toast.error('An unexpected error occurred');
    }
  };

  const openPermissionsModal = (user: AppUser) => {
    setSelectedUser(user);
    setShowPermissions(true);
    fetchUserPermissions(user.id);
  };

  const getRoleColor = (role: Role) => {
    switch (role) {
      case 'super_admin': return 'from-purple-500 to-purple-700';
      case 'admin': return 'from-red-500 to-red-700';
      case 'moderator': return 'from-yellow-500 to-yellow-700';
      default: return 'from-green-500 to-green-700';
    }
  };

  const getRoleBadgeColor = (role: Role) => {
    switch (role) {
      case 'super_admin': return 'bg-gradient-to-r from-purple-100 to-purple-200 text-purple-800 border border-purple-300';
      case 'admin': return 'bg-gradient-to-r from-red-100 to-red-200 text-red-800 border border-red-300';
      case 'moderator': return 'bg-gradient-to-r from-yellow-100 to-yellow-200 text-yellow-800 border border-yellow-300';
      default: return 'bg-gradient-to-r from-green-100 to-green-200 text-green-800 border border-green-300';
    }
  };

  const formatRoleName = (role: Role) => {
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'admin': return 'Admin';
      case 'moderator': return 'Moderator';
      default: return 'User';
    }
  };

  return (
    <Protected>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <Navbar />
        
        {/* Header Section */}
        <div className="relative overflow-hidden">
          <div className={`absolute inset-0 bg-gradient-to-r ${getRoleColor(currentUserRole)} opacity-90`}></div>
          <div className="relative max-w-7xl mx-auto px-6 py-5">
            <div className="text-center">
              <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${getRoleBadgeColor(currentUserRole)} mb-4`}>
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                {formatRoleName(currentUserRole)}
              </div>
              <h1 className="text-4xl font-bold text-white mb-4">
                {formatRoleName(currentUserRole)} Dashboard
              </h1>
              <p className="text-white/80 text-lg max-w-2xl mx-auto">
                Manage users, roles, and permissions with comprehensive access control
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 mt-5 pb-12">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-center">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5 5.197a6 6 0 00-9-5.197" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Users</p>
                  <p className="text-2xl font-bold text-gray-900">{users.length}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-center">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Super Admins</p>
                  <p className="text-2xl font-bold text-gray-900">{users.filter(u => u.role === 'super_admin').length}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-center">
                <div className="p-3 bg-red-100 rounded-lg">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Admins</p>
                  <p className="text-2xl font-bold text-gray-900">{users.filter(u => u.role === 'admin').length}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-center">
                <div className="p-3 bg-green-100 rounded-lg">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Active Users</p>
                  <p className="text-2xl font-bold text-gray-900">{users.filter(u => u.role === 'user' || u.role === 'moderator').length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Search and Filter Section */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-100">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search users by email or name..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as Role | '')}
                  className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 bg-white min-w-40"
                >
                  <option value="">All Roles</option>
                  <option value="super_admin">Super Admin</option>
                  <option value="admin">Admin</option>
                  <option value="moderator">Moderator</option>
                  <option value="user">User</option>
                </select>
              </div>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="bg-white rounded-xl shadow-lg p-12 text-center border border-gray-100">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 font-medium">Loading users...</p>
            </div>
          )}

          {/* Users Grid */}
          {!loading && (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
              {currentUsers.map((user) => (
                <div key={user.id} className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-100 overflow-hidden">
                  {/* User Card Header */}
                  <div className={`h-2 bg-gradient-to-r ${getRoleColor(user.role)}`}></div>
                  
                  <div className="p-6">
                    {/* User Info */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                          {(user.name || user.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="ml-3">
                          <h3 className="font-semibold text-gray-900 text-lg">{user.name || 'No name'}</h3>
                          <p className="text-gray-600 text-sm">{user.email}</p>
                        </div>
                      </div>
                    </div>

                    {/* Role Badge */}
                    <div className="mb-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getRoleBadgeColor(user.role)}`}>
                        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                        </svg>
                        {formatRoleName(user.role)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="space-y-3">
                      {/* Role Selection */}
                      {(currentUserRole === 'super_admin' || 
                        (currentUserRole === 'admin' && user.role !== 'super_admin' && user.role !== 'admin') ||
                        (currentUserRole === 'moderator' && user.role === 'user')) && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Change Role</label>
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user.id, e.target.value as Role)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            disabled={user.id === auth?.user?.id}
                          >
                            {currentUserRole === 'super_admin' && (
                              <>
                                <option value="super_admin">Super Admin</option>
                                <option value="admin">Admin</option>
                                <option value="moderator">Moderator</option>
                                <option value="user">User</option>
                              </>
                            )}
                            {currentUserRole === 'admin' && (
                              <>
                                <option value="super_admin" disabled>Super Admin</option>
                                <option value="admin" disabled>Admin</option>
                                <option value="moderator">Moderator</option>
                                <option value="user">User</option>
                              </>
                            )}
                            {currentUserRole === 'moderator' && (
                              <>
                                <option value="super_admin" disabled>Super Admin</option>
                                <option value="admin" disabled>Admin</option>
                                <option value="moderator" disabled>Moderator</option>
                                <option value="user">User</option>
                              </>
                            )}
                          </select>
                        </div>
                      )}

                      {/* View Only for Users */}
                      {currentUserRole === 'user' && (
                        <div className="text-center py-2">
                          <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-lg">View Only Access</span>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-2">
                        {/* Permissions Button */}
                        {currentUserRole === 'super_admin' && (
                          <button
                            onClick={() => openPermissionsModal(user)}
                            className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 text-sm font-medium flex items-center justify-center"
                          >
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            Permissions
                          </button>
                        )}

                        {/* Delete Button */}
                        {(currentUserRole === 'super_admin' || currentUserRole === 'admin') && 
                         canManageRole(currentUserRole, user.role) && 
                         user.id !== auth?.user?.id && (
                          <button
                            onClick={() => setDeleteConfirm(user.id)}
                            className="bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200 text-sm font-medium flex items-center justify-center"
                          >
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No Results */}
          {!loading && currentUsers.length === 0 && (
            <div className="bg-white rounded-xl shadow-lg p-12 text-center border border-gray-100">
              <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5 5.197a6 6 0 00-9-5.197" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No users found</h3>
              <p className="text-gray-600">Try adjusting your search or filter criteria</p>
            </div>
          )}

          {/* Pagination */}
          {filteredUsers.length > usersPerPage && (
            <div className="flex justify-center">
              <nav className="flex space-x-2">
                {Array.from({ length: Math.ceil(filteredUsers.length / usersPerPage) }, (_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      currentPage === i + 1
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </nav>
            </div>
          )}
        </div>

        {/* Permissions Modal */}
        {showPermissions && selectedUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
              {/* Modal Header */}
              <div className={`bg-gradient-to-r ${getRoleColor(selectedUser.role)} p-6`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white">Manage Permissions</h2>
                    <p className="text-white/80">
                      {selectedUser.name || 'No name'} ({selectedUser.email})
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPermissions(false)}
                    className="text-white hover:text-gray-200 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6 max-h-[calc(90vh-120px)] overflow-y-auto">
                {permissionLoading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading permissions...</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {['user_management', 'role_management', 'permission_management', 'system'].map(category => {
                      const categoryPermissions = allPermissions.filter(p => p.category === category);
                      if (categoryPermissions.length === 0) return null;

                      return (
                        <div key={category} className="border border-gray-200 rounded-xl p-4">
                          <h3 className="text-lg font-semibold text-gray-900 mb-4 capitalize">
                            {category.replace('_', ' ')} Permissions
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {categoryPermissions.map(permission => {
                              const hasPermission = userPermissions.some(up => up.permission_id === permission.id);
                              return (
                                <label key={permission.id} className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={hasPermission}
                                    onChange={(e) => handlePermissionChange(selectedUser.id, permission.id, e.target.checked)}
                                    className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                  />
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">{permission.name}</div>
                                    <div className="text-sm text-gray-600">{permission.description}</div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.996-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Confirm Deletion</h3>
                <p className="text-gray-600 mb-6">
                  Are you sure you want to delete this user? This action cannot be undone and will remove all associated data.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDelete(deleteConfirm)}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200 font-medium"
                  >
                    Delete User
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Protected>
  );
};

export default Dashboard;

