// Where the email sign-in link lands. SessionProvider reads the session off the URL; this screen just
// waits for it, then hands off to the normal guards (onboarding or the tabs).
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isOnboarded, useSession } from '@/providers/session';

export default function AuthCallbackScreen() {
  const theme = useTheme();
  const { session, profile, linkError } = useSession();

  if (session && profile) return <Redirect href={isOnboarded(profile) ? '/' : '/onboarding'} />;

  return (
    <ThemedView style={styles.center}>
      {linkError ? (
        <>
          <ThemedText type="smallBold" themeColor="danger" style={styles.text}>
            That sign-in link didn&apos;t work: {linkError}
          </ThemedText>
          <Button title="Send a new link" onPress={() => router.replace('/sign-in')} />
        </>
      ) : (
        <>
          <ActivityIndicator color={theme.accent} />
          <ThemedText themeColor="textSecondary">Signing you in…</ThemedText>
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  text: {
    textAlign: 'center',
  },
});
