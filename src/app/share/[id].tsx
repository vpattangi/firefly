// Post-walk contact sharing. Each toggle writes a one-way contact_shares row; contact details
// are only returned by get_share_status once BOTH people have shared.

import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ContactLinks } from '@/components/contact-links';
import { Card, ErrorText, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { getShareStatus, setContactShare, type ShareStatus } from '@/lib/api';

export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [people, setPeople] = useState<ShareStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getShareStatus(id)
      .then(setPeople)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  const toggle = async (person: ShareStatus, share: boolean) => {
    setError(null);
    setPeople((prev) => prev?.map((p) => (p.user_id === person.user_id ? { ...p, i_shared: share } : p)) ?? null);
    try {
      await setContactShare(id, person.user_id, share);
    } catch (e) {
      setError((e as Error).message);
    }
    load();
  };

  return (
    <Screen safeTop={false}>
      <ThemedText themeColor="textSecondary">
        Choose who you&apos;d like to stay in touch with. Nothing is shared unless you both say yes — they won&apos;t
        be told if you don&apos;t.
      </ThemedText>

      {people?.length === 0 && <ThemedText themeColor="textSecondary">No one else checked in on this walk.</ThemedText>}

      {people?.map((person) => (
        <Card key={person.user_id}>
          <View style={styles.row}>
            <Avatar path={person.avatar_path} name={person.first_name} />
            <View style={styles.flex}>
              <ThemedText type="smallBold">{person.first_name ?? 'Walker'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {person.mutual ? 'You both shared — say hi!' : person.i_shared ? 'Waiting for them to share too' : 'Share my contact info'}
              </ThemedText>
            </View>
            <Switch value={person.i_shared} onValueChange={(v) => toggle(person, v)} />
          </View>
          {person.mutual && <ContactLinks contact={person} />}
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
