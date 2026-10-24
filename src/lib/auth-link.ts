// Sign-in by email link. Supabase's default emails (no custom SMTP / template edits) contain a link,
// not a 6-digit code. The link verifies the user, then redirects to AUTH_REDIRECT_URL with the session
// in the URL fragment (#access_token=…&refresh_token=…), which this file turns into a signed-in session.

import type { EmailOtpType } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase';

/**
 * Where the email link sends people: `exp://<LAN IP>:8081/--/auth-callback` in Expo Go,
 * `packtrackapp://auth-callback` in a build, `http://localhost:8081/auth-callback` on web.
 * Supabase only redirects to URLs in Authentication → URL Configuration → Redirect URLs.
 */
export const AUTH_REDIRECT_URL = Linking.createURL('auth-callback');

/** Query and fragment params of a URL. Parsed by hand: React Native's URL support is partial. */
function urlParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const parts = [url.split('#')[1], url.split('#')[0].split('?')[1]];
  for (const part of parts) {
    for (const pair of (part ?? '').split('&')) {
      const [k, v = ''] = pair.split('=');
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    }
  }
  return params;
}

/** True when the URL carries anything an email sign-in link produces. */
export function isAuthUrl(url: string) {
  const p = urlParams(url);
  return !!(p.error_description || p.error || p.access_token || p.token_hash || (p.token && p.type));
}

/**
 * Signs in from an email link. Accepts the redirect the link lands on (`…#access_token=…`, including
 * Supabase's `localhost:3000` fallback page when the redirect URL isn't allow-listed) or the email link
 * itself (`…/auth/v1/verify?token=…&type=…`, if copied instead of tapped).
 * Returns null on success or when the URL isn't an auth link, otherwise an error message to show.
 */
export async function signInFromUrl(url: string): Promise<string | null> {
  const p = urlParams(url);
  if (p.error_description || p.error) return p.error_description || p.error;
  if (p.access_token && p.refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token: p.access_token, refresh_token: p.refresh_token });
    return error?.message ?? null;
  }
  // The email link carries the hashed token as `token`; templates can also send `token_hash`.
  const tokenHash = p.token_hash ?? p.token;
  if (tokenHash && p.type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: p.type as EmailOtpType });
    return error?.message ?? null;
  }
  return null;
}
