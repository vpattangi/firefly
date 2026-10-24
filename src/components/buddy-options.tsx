// Gender (profile) and buddy preference (per walk) pickers for the women's buddy system.
// The database enforces the same rules (see supabase/migrations/0006_firefly_buddies_and_reveal.sql);
// these components just only offer what each person is allowed to pick.

import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import type { BuddyPref, Gender } from '@/lib/api';

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'nonbinary', label: 'Non-binary' },
];

export const BUDDY_PREF_LABEL: Record<BuddyPref, string> = {
  anyone: 'Anyone',
  women_nonbinary: 'Women and non-binary',
  women_only: 'Women only',
};

/** Which buddy options a person can choose, based on the gender they selected. */
export function allowedBuddyPrefs(gender: Gender | null | undefined): BuddyPref[] {
  if (gender === 'woman') return ['anyone', 'women_nonbinary', 'women_only'];
  if (gender === 'nonbinary') return ['anyone', 'women_nonbinary'];
  return ['anyone'];
}

export function GenderPicker({ value, onChange, disabled }: { value: Gender | null | undefined; onChange: (g: Gender) => void; disabled?: boolean }) {
  return (
    <View style={styles.chips}>
      {GENDER_OPTIONS.map((o) => (
        <Chip key={o.value} label={o.label} selected={value === o.value} onPress={() => !disabled && onChange(o.value)} />
      ))}
    </View>
  );
}

export function BuddyPrefPicker({ gender, value, onChange }: { gender: Gender | null | undefined; value: BuddyPref; onChange: (p: BuddyPref) => void }) {
  const options = allowedBuddyPrefs(gender);
  return (
    <View style={styles.wrap}>
      <View style={styles.chips}>
        {options.map((p) => (
          <Chip key={p} label={BUDDY_PREF_LABEL[p]} selected={value === p} onPress={() => onChange(p)} />
        ))}
      </View>
      {value === 'women_only' && (
        <ThemedText type="small" themeColor="textSecondary">
          You&apos;ll only be matched with students who selected Woman.
        </ThemedText>
      )}
      {value === 'women_nonbinary' && (
        <ThemedText type="small" themeColor="textSecondary">
          You&apos;ll only be matched with women and non-binary students.
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
