import * as Linking from 'expo-linking';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmergencyPhone, SafeWalkPhone, Spacing } from '@/constants/theme';

export function SafetyBar() {
  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <Button compact variant="secondary" title="Call SafeWalk" onPress={() => Linking.openURL(`tel:${SafeWalkPhone}`)} />
      </View>
      <View style={styles.cell}>
        <Button compact variant="secondary" title="Text SafeWalk" onPress={() => Linking.openURL(`sms:${SafeWalkPhone}`)} />
      </View>
      <View style={styles.cell}>
        <Button compact variant="danger" title="Call 911" onPress={() => Linking.openURL(`tel:${EmergencyPhone}`)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  cell: {
    flex: 1,
  },
});
