export type Role = 'admin' | 'user' | 'moderator';

export interface AppUser {
  id: string;
  name?: string;
  email: string;
  role: Role;
}
