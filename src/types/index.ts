export type Role = 'super_admin' | 'admin' | 'user' | 'moderator';

export interface Permission {
  id: string;
  name: string;
  description: string;
  category: 'user_management' | 'role_management' | 'permission_management' | 'system';
}

export interface UserPermission {
  id: string;
  user_id: string;
  permission_id: string;
  granted_by: string;
  granted_at: string;
}

export interface AppUser {
  id: string;
  name?: string;
  email: string;
  role: Role;
  permissions?: Permission[];
  created_at?: string;
  updated_at?: string;
}
