import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { WalkMapProps } from '@/components/walk-map';

export type { MapPin, MapZone, WalkMapProps } from '@/components/walk-map';

// react-native-maps has no web support. Draw the design's illustrative campus map and list the real pins
// on top so the flow is still usable (destinations can only be picked on a phone).
export function WalkMap({ pins, zones = [], onPinPress, height = 320, rounded = true }: WalkMapProps) {
  const theme = useTheme();
  return (
    <View style={[styles.map, { height, borderRadius: rounded ? Radius.lg : 0, backgroundColor: theme.backgroundSelected }]}>
      <View style={[styles.block, { left: -20, top: 90, width: 80, height: 150, backgroundColor: theme.border }]} />
      <View style={[styles.block, { right: -20, top: 20, width: 60, height: 90, backgroundColor: theme.border }]} />
      <View style={[styles.campus, { backgroundColor: theme.amberSoft }]} />
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        <ThemedView type="backgroundElement" style={styles.panel}>
          <ThemedText type="small" themeColor="textSecondary">
            Live map is in the mobile app (Expo Go). Pick destinations on your phone.
          </ThemedText>
          {zones.map((z) => (
            <View key={`zone-${z.id}`} style={styles.item}>
              <Ionicons name="warning-outline" size={14} color={z.severity === 'high' ? theme.danger : theme.warning} />
              <ThemedText type="small" themeColor={z.severity === 'high' ? 'danger' : 'warning'}>
                {z.title}
              </ThemedText>
            </View>
          ))}
          {pins.map((pin) => (
            <Pressable key={pin.id} onPress={() => onPinPress?.(pin.id)} style={styles.item}>
              <Ionicons
                name={pin.kind === 'meetup-selected' ? 'radio-button-on' : pin.kind === 'destination' ? 'flag-outline' : 'radio-button-off'}
                size={14}
                color={pin.kind === 'meetup-selected' ? theme.amber : theme.accent}
              />
              <ThemedText type={pin.kind === 'meetup-selected' ? 'smallBold' : 'small'}>{pin.title}</ThemedText>
            </Pressable>
          ))}
        </ThemedView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    width: '100%',
    overflow: 'hidden',
  },
  block: {
    position: 'absolute',
    borderRadius: 6,
  },
  campus: {
    position: 'absolute',
    left: 90,
    top: 100,
    width: 190,
    height: 170,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: Spacing.three,
    paddingTop: 96,
  },
  panel: {
    padding: Spacing.three,
    borderRadius: Radius.md,
    gap: Spacing.two,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
