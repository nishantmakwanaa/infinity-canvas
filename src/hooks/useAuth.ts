import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

function normalizeAvatarUrl(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('http://')) return `https://${raw.slice(7)}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  return null;
}

function firstValidAvatar(candidates: unknown[]) {
  for (const candidate of candidates) {
    const normalized = normalizeAvatarUrl(candidate);
    if (normalized) return normalized;
  }
  return null;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const extractUser = useCallback((supaUser: User): AuthUser => {
    const email = supaUser.email || '';
    // Canonical, immutable username: email local-part (unique in Supabase).
    const username = (email.split('@')[0] || 'user').toLowerCase();
    const meta = (supaUser.user_metadata || {}) as Record<string, unknown>;
    const identities = Array.isArray((supaUser as any).identities) ? (supaUser as any).identities : [];
    const identityData = identities
      .map((identity: any) => identity?.identity_data || {})
      .filter((data: any) => data && typeof data === 'object');
    const firstName = String(meta.given_name || '').trim();
    const lastName = String(meta.family_name || '').trim();
    const fullName = String(meta.full_name || meta.name || '').trim();
    const displayName = `${firstName} ${lastName}`.trim() || fullName || username;
    const avatarUrl = firstValidAvatar([
      meta.avatar_url,
      meta.picture,
      meta.photoURL,
      meta.profile_image,
      ...identityData.map((data: any) => data.avatar_url),
      ...identityData.map((data: any) => data.picture),
      ...identityData.map((data: any) => data.photoURL),
    ]);
    return { id: supaUser.id, email, username, displayName, avatarUrl };
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
    const configuredRedirect = import.meta.env.VITE_AUTH_REDIRECT_TO?.trim();
    const currentUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    let redirectTo = configuredRedirect && configuredRedirect.length > 0
      ? configuredRedirect
      : currentUrl;

    // If user is on a deep-link share page, always return to that exact URL after auth.
    if (window.location.pathname !== '/' || window.location.search) {
      redirectTo = currentUrl;
    }

    // Enforce clean path-based routing (no hash-based redirects).
    redirectTo = redirectTo.replace('/#/', '/');
    if (redirectTo.includes('#')) {
      redirectTo = currentUrl;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        // Force account chooser to avoid sticky previous-account behavior.
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    if (error) {
      console.error('Sign in error:', error);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return { user, session, loading, signInWithGoogle, signOut };
}
