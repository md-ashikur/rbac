'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AppUser } from '@/types';

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        const { data } = await supabase
          .from('rbac_users')
          .select('role')
          .eq('id', session.user.id)
          .single();

        setUser({ 
          id: session.user.id, 
          name: session.user.user_metadata?.name,
          email: session.user.email || '', 
          role: data?.role || 'user' 
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    };

    getUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        setUser(null);
        setLoading(false);
      } else if (session?.user) {
        const { data } = await supabase
          .from('rbac_users')
          .select('role')
          .eq('id', session.user.id)
          .single();

        setUser({ 
          id: session.user.id, 
          name: session.user.user_metadata?.name,
          email: session.user.email || '', 
          role: data?.role || 'user' 
        });
        setLoading(false);
      }
    });
    
    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
