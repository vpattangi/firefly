import * as Linking from 'expo-linking';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Spacing } from '@/constants/theme';
import type { ContactInfo } from '@/lib/api';

export function ContactLinks({ contact }: { contact: ContactInfo }) {
  return (
    <View style={styles.row}>
      {contact.phone && (
        <>
          <Button compact variant="secondary" title="Call" onPress={() => Linking.openURL(`tel:${contact.phone}`)} />
          <Button compact variant="secondary" title="Text" onPress={() => Linking.openURL(`sms:${contact.phone}`)} />
        </>
      )}
      {contact.email && (
        <Button compact variant="secondary" title="Email" onPress={() => Linking.openURL(`mailto:${contact.email}`)} />
      )}
      {contact.instagram && (
        <Button
          compact
          variant="secondary"
          title={`@${contact.instagram}`}
          onPress={() => Linking.openURL(`https://instagram.com/${encodeURIComponent(contact.instagram!)}`)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
