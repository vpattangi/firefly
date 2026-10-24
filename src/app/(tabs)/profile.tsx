// Profile (design: "Your profile" frame): photo, first name, contact info, dashboard, sign out.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Logo, Tagline } from '@/components/brand';
import { GenderPicker } from '@/components/buddy-options';
import { Button } from '@/components/button';
import { Card, ErrorText, Field, Notice, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchContactInfo, setMyGender, updateContactInfo, updateProfile, type Gender, type VerificationStatus } from '@/lib/api';
import { pickImage, uploadImage } from '@/lib/images';
import { useSession } from '@/providers/session';

const VERIFICATION: Record<
  VerificationStatus,
  { label: string; color: ThemeColor; icon: 'checkmark-circle-outline' | 'hourglass-outline' | 'alert-circle-outline' }
> = {
  unverified: { label: 'Not verified', color: 'danger', icon: 'alert-circle-outline' },
  pending: { label: 'ID under review', color: 'warning', icon: 'hourglass-outline' },
  verified: { label: 'Verified', color: 'success', icon: 'checkmark-circle-outline' },
  rejected: { label: 'Verification rejected', color: 'danger', icon: 'alert-circle-outline' },
};

export default function ProfileScreen() {
  const theme = useTheme();
  const { session, profile, refreshProfile, signOut } = useSession();
  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    fetchContactInfo(userId)
      .then((c) => {
        setPhone(c?.phone ?? '');
        setInstagram(c?.instagram ?? '');
      })
      .catch((e: Error) => setError(e.message));
  }, [userId]);

  const [genderSaving, setGenderSaving] = useState(false);
  const changeGender = async (gender: Gender) => {
    if (gender === profile?.gender) return;
    setGenderSaving(true);
    setError(null);
    try {
      await setMyGender(gender);
      await refreshProfile();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenderSaving(false);
    }
  };

  const changePhoto = async () => {
    if (!userId) return;
    try {
      const img = await pickImage({ source: 'library', square: true });
      if (!img) return;
      const path = await uploadImage('avatars', `${userId}/avatar-${Date.now()}.jpg`, img);
      await updateProfile(userId, { avatar_path: path });
      await refreshProfile();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const save = async () => {
    if (!userId) return;
    if (!firstName.trim()) {
      setError('First name is required.');
      return;
    }
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      if (firstName.trim() !== profile?.first_name) {
        await updateProfile(userId, { first_name: firstName.trim() });
        await refreshProfile();
      }
      await updateContactInfo(userId, {
        phone: phone.trim() || null,
        instagram: instagram.trim().replace(/^@/, '') || null,
      });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const verification = VERIFICATION[profile?.verification_status ?? 'unverified'];

  return (
    <Screen bottomInset={BottomTabInset} title="Your profile" subtitle="A familiar face for your next walk.">
      <Card style={styles.photoCard}>
        <View>
          <Avatar path={profile?.avatar_path} name={profile?.first_name} size={66} />
          <View style={[styles.cam, { backgroundColor: theme.accent, borderColor: theme.backgroundElement }]}>
            <Ionicons name="camera" size={12} color={theme.onAccent} />
          </View>
        </View>
        <View style={styles.flex}>
          <ThemedText type="smallBold">Profile photo · Required</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Help your buddy recognize you. Use a clear photo of your face. It unlocks for buddies within about 30 feet.
          </ThemedText>
          <ThemedText type="smallBold" themeColor="accent" onPress={changePhoto}>
            Change photo
          </ThemedText>
        </View>
      </Card>

      <View style={styles.verified}>
        <Ionicons name={verification.icon} size={18} color={theme[verification.color]} />
        <ThemedText type="small" themeColor={verification.color}>
          {session?.user.email} · {verification.label}
        </ThemedText>
      </View>

      <Field label="First name" value={firstName} onChangeText={setFirstName} autoComplete="given-name" />
      <ThemedText type="smallBold">Gender</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Used for buddy matching and never shown to other students. You can&apos;t change it during an active walk.
      </ThemedText>
      <GenderPicker value={profile?.gender} onChange={changeGender} disabled={genderSaving} />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="Instagram" value={instagram} onChangeText={setInstagram} autoCapitalize="none" />

      <Notice icon="lock-closed-outline">
        Your first name and photo are shared with your assigned group. Contact info is only shared with walk buddies who
        also chose to share with you. Your school email stays private.
      </Notice>

      <ErrorText message={error} />
      <Button title={saved ? 'Saved' : 'Save profile'} onPress={save} loading={saving} />
      <Button title="Campus safety dashboard" icon="stats-chart-outline" variant="secondary" onPress={() => router.push('/admin')} />
      <Button title="Sign out" icon="log-out-outline" variant="secondary" onPress={signOut} />
      <View style={styles.footerBrand}>
        <Logo size={18} />
        <Tagline size={13} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footerBrand: { alignItems: 'center', gap: 4, marginTop: Spacing.three },
  flex: {
    flex: 1,
    gap: Spacing.one,
  },
  photoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cam: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
