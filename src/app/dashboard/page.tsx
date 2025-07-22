'use client';

import React, { useEffect, useState } from 'react';
import { AppUser, Role } from '@/types';
import Navbar from '@/components/navbar';
import Protected from '@/components/protected';
import toast from 'react-hot-toast';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';

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
    setLoading(true);
    try {
      if (!auth?.user) {
        toast.error('Not authenticated');
        return;
      }

      // Get the current session to pass as authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });
      const result = await response.json();
      
      if (!response.ok) {
        toast.error(result.error || 'Failed to fetch users');
        console.error('Error fetching users:', result.error);
      } else if (result.users) {
        setUsers(result.users);
        setCurrentUserRole(result.currentUserRole);
        console.log('Fetched users:', result.users); // Debug log
      }
    } catch (err) {
      toast.error('An unexpected error occurred');
      console.error('Unexpected error:', err);
    }
    setLoading(false);
  }, [auth?.user]);

  useEffect(() => {
    fetchUsers();
  }, [auth?.user]);

  const filteredUsers = users
    .filter((u) => u.email.toLowerCase().includes(search.toLowerCase()))
    .filter((u) => (roleFilter ? u.role === roleFilter : true));

  const indexOfLastUser = currentPage * usersPerPage;
  const indexOfFirstUser = indexOfLastUser - usersPerPage;
  const currentUsers = filteredUsers.slice(indexOfFirstUser, indexOfLastUser);

  const handleRoleChange = async (userId: string, newRole: Role) => {
    try {
      // Get the current session to pass as authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId, role: newRole }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        toast.error(result.error || 'Failed to update user role');
        console.error('Error updating role:', result.error);
      } else {
        toast.success('User role updated successfully');
        fetchUsers();
      }
    } catch (err) {
      toast.error('An unexpected error occurred');
      console.error('Unexpected error:', err);
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
        fetchUsers();
        setDeleteConfirm(null);
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
            {currentUserRole === 'admin' ? 'Admin' : currentUserRole === 'moderator' ? 'Moderator' : 'User'} Dashboard
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
              <option value="admin">Admin</option>
              <option value="user">User</option>
              <option value="moderator">Moderator</option>
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
                            user.role === 'admin' 
                              ? 'bg-red-100 text-red-800'
                              : user.role === 'moderator'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            {/* Only admins can change roles */}
                            {currentUserRole === 'admin' && (
                              <select
                                value={user.role}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => 
                                  handleRoleChange(user.id, e.target.value as Role)
                                }
                                className="px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="admin">Admin</option>
                                <option value="user">User</option>
                                <option value="moderator">Moderator</option>
                              </select>
                            )}
                            
                            {/* Moderators can see roles but can't change to admin */}
                            {currentUserRole === 'moderator' && (
                              <select
                                value={user.role}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => 
                                  handleRoleChange(user.id, e.target.value as Role)
                                }
                                className="px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                                disabled={user.role === 'admin'} // Can't change admin roles
                              >
                                <option value="admin" disabled>Admin</option>
                                <option value="user">User</option>
                                <option value="moderator">Moderator</option>
                              </select>
                            )}
                            
                            {/* Regular users can only view roles */}
                            {currentUserRole === 'user' && (
                              <span className="px-3 py-1 text-sm text-gray-600">
                                View Only
                              </span>
                            )}
                            
                            {/* Only admins can delete users */}
                            {currentUserRole === 'admin' && (
                              <button
                                onClick={() => setDeleteConfirm(user.id)}
                                className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors"
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

