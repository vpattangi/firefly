import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ContactLinks } from '@/components/contact-links';
import { Card, ErrorText, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { getMutualContacts, type MutualContact } from '@/lib/api';

export default function BuddiesScreen() {
  const [buddies, setBuddies] = useState<MutualContact[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getMutualContacts()
        .then(setBuddies)
        .catch((e: Error) => setError(e.message));
    }, [])
  );

  return (
    <Screen
      bottomInset={BottomTabInset}
      title="Walk buddies"
      subtitle="People you walked with where you both chose to share contact info.">
      {buddies?.length === 0 && (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            No buddies yet. After a walk, you can choose to share your info with the people you walked with.
          </ThemedText>
        </Card>
      )}

      {buddies?.map((b) => (
        <Card key={b.user_id}>
          <View style={styles.row}>
            <Avatar path={b.avatar_path} name={b.first_name} />
            <View style={styles.flex}>
              <ThemedText type="smallBold">{b.first_name ?? 'Walker'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Connected {new Date(b.connected_at).toLocaleDateString()}
              </ThemedText>
            </View>
          </View>
          <ContactLinks contact={b} />
        </Card>
      ))}

      <ErrorText message={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  flex: {
    flex: 1,
  },
});
