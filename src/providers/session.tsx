import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { fetchProfile, type Profile } from '@/lib/api';
import { isAuthUrl, signInFromUrl } from '@/lib/auth-link';
import { supabase } from '@/lib/supabase';

type SessionContextValue = {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  /** Why the last email sign-in link failed (expired, already used…), shown on the sign-in screen. */
  linkError: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession() {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);

  const loadProfile = useCallback(async (next: Session | null) => {
    try {
      setProfile(next ? await fetchProfile(next.user.id) : null);
    } catch (e) {
      console.warn('Failed to load profile', e);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session);
      setIsLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Supabase warns against awaiting other client calls inside this callback.
      setTimeout(() => loadProfile(next), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  // Email sign-in links open the app (cold start or while running); turn them into a session.
  useEffect(() => {
    const handle = (url: string | null) => {
      if (url && isAuthUrl(url)) signInFromUrl(url).then(setLinkError);
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, []);

  // Re-check the profile when the app comes back to the foreground, so an ID approval
  // made by a reviewer shows up without a restart.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && session) loadProfile(session);
    });
    return () => sub.remove();
  }, [loadProfile, session]);

  const refreshProfile = useCallback(() => loadProfile(session), [loadProfile, session]);
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <SessionContext value={{ session, profile, isLoading, linkError, refreshProfile, signOut }}>
      {children}
    </SessionContext>
  );
}

/** Onboarding is done once the profile is filled in and an ID is awaiting or passed review. */
export function isOnboarded(profile: Profile | null) {
  return (
    !!profile?.first_name &&
    !!profile.avatar_path &&
    (profile.verification_status === 'pending' || profile.verification_status === 'verified')
  );
}
