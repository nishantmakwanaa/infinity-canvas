import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import type { User, Session } from '@supabase/supabase-js';

interface AuthUser {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const extractUser = useCallback((supaUser: User): AuthUser => {
    const meta = supaUser.user_metadata || {};
    const email = supaUser.email || '';
    const username = meta.full_name || meta.name || email.split('@')[0] || 'User';
    const avatarUrl = meta.avatar_url || meta.picture || null;
    return { id: supaUser.id, email, username, avatarUrl };
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ? extractUser(session.user) : null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ? extractUser(session.user) : null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [extractUser]);

  const signInWithGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      console.error('Sign in error:', result.error);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return { user, session, loading, signInWithGoogle, signOut };
}
