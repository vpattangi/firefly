// Welcome / sign in (design: "Welcome" frame). .edu email → one-time code.
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo, Tagline } from '@/components/brand';
import { Button } from '@/components/button';
import { ErrorText, Field, Notice } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AUTH_REDIRECT_URL, isAuthUrl, signInFromUrl } from '@/lib/auth-link';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

const EDU_EMAIL = /^[^\s@]+@([a-z0-9-]+\.)*[a-z0-9-]+\.edu$/i;
// TEMPORARY: non-.edu test accounts, mirrored in public.test_email_allowlist (migration 0005). Remove before launch.
const TEST_EMAILS = ['imarshshah@gmail.com', 'emmanuelelizaldeocampo@gmail.com'];

export default function SignInScreen() {
  const theme = useTheme();
  const { linkError } = useSession();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!EDU_EMAIL.test(trimmed) && !TEST_EMAILS.includes(trimmed)) {
      setError('Use your university email address (it must end in .edu).');
      return;
    }
    setLoading(true);
    setError(null);
    // The default Supabase email has a sign-in link (and a code only if the template adds {{ .Token }}).
    const { error } = await supabase.auth.signInWithOtp({ email: trimmed, options: { emailRedirectTo: AUTH_REDIRECT_URL } });
    setLoading(false);
    if (error) setError(error.message);
    else setCodeSent(true);
  };

  // TEMPORARY: test accounts skip the email link and sign in with a password set in the database.
  const isTestEmail = TEST_EMAILS.includes(email.trim().toLowerCase());
  const signInWithPassword = async () => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setLoading(false);
    if (error) setError(error.message);
  };

  // Accepts a 6-digit code, or a pasted sign-in link / the address of the page the link opened.
  const verifyCode = async () => {
    const value = code.trim();
    setLoading(true);
    setError(null);
    let message: string | null;
    if (value.includes('://')) {
      message = isAuthUrl(value) ? await signInFromUrl(value) : "That doesn't look like a sign-in link.";
    } else {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: value, type: 'email' });
      message = error?.message ?? null;
    }
    setLoading(false);
    // On success the session listener swaps this screen out automatically.
    if (message) setError(message);
  };

  return (
    <ThemedView type="backgroundElement" style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <View style={[styles.hero, { backgroundColor: theme.navy }]}>
            <SafeAreaView edges={['top']}>
              <View style={styles.brand}>
                <Logo size={26} light />
                <Tagline light />
              </View>
            </SafeAreaView>
            <View style={styles.illus}>
              <View style={[styles.frame, { borderColor: theme.amber }]} />
              <View style={styles.card} />
              <View style={[styles.avatar, { backgroundColor: theme.amber }]}>
                <Ionicons name="people-outline" size={26} color={theme.navy} />
              </View>
              <View style={styles.stepCircle}>
                <Ionicons name="footsteps" size={20} color={theme.accent} />
              </View>
              <View style={styles.chip}>
                <ThemedText type="small" style={styles.chipText}>
                  Better with a buddy.
                </ThemedText>
              </View>
            </View>
            <ThemedText style={styles.uni}>SAN JOSÉ STATE UNIVERSITY</ThemedText>
          </View>

          <SafeAreaView edges={['bottom']} style={styles.body}>
            <ThemedText style={styles.title}>Late night?{'\n'}Walk with your pack.</ThemedText>
            <ThemedText themeColor="textSecondary">
              Meet fellow Spartans nearby and head home together from downtown San José.
            </ThemedText>

            <Field
              label="SJSU email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@sjsu.edu"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              editable={!codeSent}
            />

            {codeSent ? (
              <>
                <Notice icon="mail-unread-outline">
                  Check {email.trim().toLowerCase()} and tap the sign-in link on this device. It opens the app and signs you
                  in. (It can take a minute; check spam too.)
                </Notice>
                <Field
                  label="Link opened a page that didn't load? Paste its address"
                  value={code}
                  onChangeText={setCode}
                  placeholder="Paste the page address, the email link, or a code"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="one-time-code"
                />
                <Button title="Sign in" onPress={verifyCode} loading={loading} disabled={code.trim().length < 6} />
                <Button
                  title="Use a different email"
                  variant="secondary"
                  onPress={() => {
                    setCodeSent(false);
                    setCode('');
                  }}
                />
              </>
            ) : isTestEmail ? (
              <>
                <Field
                  label="Test account password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Button title="Sign in" onPress={signInWithPassword} loading={loading} disabled={!password} />
              </>
            ) : (
              <>
                <Button title="Sign up or log in with SJSU email" onPress={sendCode} loading={loading} />
                <ThemedText type="smallBold" themeColor="accent" style={styles.center} onPress={() => setCodeSent(true)}>
                  Already have a sign-in link or code?
                </ThemedText>
              </>
            )}

            <ErrorText message={error ?? (linkError ? `That sign-in link didn't work: ${linkError}. Send a new one.` : null)} />
            <Notice icon="shield-checkmark-outline">
              Spartans only. Use your @sjsu.edu email; we&apos;ll email you a sign-in link. ID verification is required
              before you&apos;re matched with anyone.
            </Notice>
          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

// The hero is a fixed illustration on the brand navy, so its whites are part of the artwork.
const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  hero: { height: 360, paddingHorizontal: 20 },
  brand: { gap: 6, marginTop: 20 },
  illus: { flex: 1, width: 300, alignSelf: 'center' },
  frame: { position: 'absolute', left: 46, top: 28, width: 200, height: 110, borderWidth: 4, borderRadius: Radius.sm },
  card: { position: 'absolute', left: 130, top: 62, width: 110, height: 90, backgroundColor: '#0F2D52', borderRadius: Radius.md },
  avatar: { position: 'absolute', left: 212, top: 40, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  stepCircle: { position: 'absolute', left: 34, top: 100, width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  chip: { position: 'absolute', left: 143, top: 120, backgroundColor: '#fff', borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 12, color: '#172B40' },
  uni: { color: '#D5DCE5', fontSize: 11, letterSpacing: 0.5, marginBottom: 14 },
  body: { flex: 1, padding: 20, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  title: { fontSize: 30, fontWeight: '700', lineHeight: 36 },
  center: { textAlign: 'center' },
});
