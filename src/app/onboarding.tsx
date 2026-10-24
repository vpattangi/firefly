// First-run profile + ID verification (design: "Your profile" frame).
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Logo, Tagline } from '@/components/brand';
import { GenderPicker } from '@/components/buddy-options';
import { Button } from '@/components/button';
import { Card, ErrorText, Field, Notice, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { setMyGender, submitIdVerification, updateContactInfo, updateProfile, type Gender } from '@/lib/api';
import { pickImage, uploadImage, type PickedImage } from '@/lib/images';
import { useSession } from '@/providers/session';

export default function OnboardingScreen() {
  const theme = useTheme();
  const { session, profile, refreshProfile, signOut } = useSession();
  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [gender, setGender] = useState<Gender | null>(profile?.gender ?? null);
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [avatar, setAvatar] = useState<PickedImage | null>(null);
  const [idFront, setIdFront] = useState<PickedImage | null>(null);
  const [selfie, setSelfie] = useState<PickedImage | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user.id;
  const ready = !!firstName.trim() && !!gender && (!!avatar || !!profile?.avatar_path) && !!idFront && !!selfie;

  const choose = (setter: (img: PickedImage) => void, opts: Parameters<typeof pickImage>[0]) => async () => {
    try {
      const img = await pickImage(opts);
      if (img) setter(img);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submit = async () => {
    if (!userId || !idFront || !selfie || !gender) return;
    setSaving(true);
    setError(null);
    try {
      const stamp = Date.now();
      const avatarPath = avatar
        ? await uploadImage('avatars', `${userId}/avatar-${stamp}.jpg`, avatar)
        : profile?.avatar_path ?? null;
      const idPath = await uploadImage('id-documents', `${userId}/id-front-${stamp}.jpg`, idFront);
      const selfiePath = await uploadImage('id-documents', `${userId}/selfie-${stamp}.jpg`, selfie);

      await updateProfile(userId, { first_name: firstName.trim(), avatar_path: avatarPath });
      if (gender !== profile?.gender) await setMyGender(gender);
      await updateContactInfo(userId, {
        phone: phone.trim() || null,
        instagram: instagram.trim().replace(/^@/, '') || null,
      });
      await submitIdVerification(idPath, selfiePath);
      await refreshProfile();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title="Your profile"
      subtitle="A familiar face for your next walk."
      footer={
        <>
          <ErrorText message={error} />
          <Button title="Save profile and submit ID" onPress={submit} loading={saving} disabled={!ready} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            First name, gender, a profile photo, your ID and a selfie are required.{' '}
            <ThemedText type="small" themeColor="accent" onPress={signOut}>
              Sign out
            </ThemedText>
          </ThemedText>
        </>
      }>
      <View style={styles.brandRow}>
        <Logo size={22} />
        <Tagline />
      </View>
      {profile?.verification_status === 'rejected' && (
        <Card>
          <ThemedText type="smallBold" themeColor="danger">
            We couldn&apos;t verify your last submission. Please retake clear photos of your ID and face.
          </ThemedText>
        </Card>
      )}

      <Card style={styles.photoCard}>
        <View>
          <Avatar path={profile?.avatar_path} localUri={avatar?.uri} name={firstName} size={66} />
          <View style={[styles.cam, { backgroundColor: theme.accent, borderColor: theme.backgroundElement }]}>
            <Ionicons name="camera" size={12} color={theme.onAccent} />
          </View>
        </View>
        <View style={styles.flex}>
          <ThemedText type="smallBold">Profile photo · Required</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Help your buddy recognize you. Use a clear photo of your face. It only unlocks for buddies once you&apos;re within about 30 feet of each other.
          </ThemedText>
          <View style={styles.links}>
            <ThemedText type="smallBold" themeColor="accent" onPress={choose(setAvatar, { source: 'camera', square: true, frontCamera: true })}>
              Take photo
            </ThemedText>
            <ThemedText type="smallBold" themeColor="accent" onPress={choose(setAvatar, { source: 'library', square: true })}>
              Choose photo
            </ThemedText>
          </View>
        </View>
      </Card>

      <View style={styles.verified}>
        <Ionicons name="mail-outline" size={18} color={theme.success} />
        <ThemedText type="small" themeColor="success">
          {session?.user.email} · Email confirmed
        </ThemedText>
      </View>

      <Field label="First name" value={firstName} onChangeText={setFirstName} autoComplete="given-name" />

      <ThemedText type="smallBold">Gender · Required</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Used for buddy matching. Women can choose to walk only with women, and women and non-binary students can choose
        to walk only with women and non-binary students. Never shown to other students.
      </ThemedText>
      <GenderPicker value={gender} onChange={setGender} />

      <ThemedText type="smallBold">Contact info (private, optional)</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Only shared after a walk, and only with someone who also chooses to share with you.
      </ThemedText>
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
      <Field label="Instagram" value={instagram} onChangeText={setInstagram} autoCapitalize="none" />

      <Card>
        <ThemedText type="smallBold">Verify your ID</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          A photo of the front of your driver&apos;s license, state ID or passport, plus a selfie so we can match them.
          Only our review team sees these, never other students.
        </ThemedText>
        <View style={styles.idRow}>
          <IdThumb label="ID front" image={idFront} onPress={choose(setIdFront, { source: 'camera' })} />
          <IdThumb label="Selfie" image={selfie} onPress={choose(setSelfie, { source: 'camera', frontCamera: true })} />
        </View>
      </Card>

      <Notice icon="lock-closed-outline">
        Until you meet, buddies only see that you&apos;re a verified SJSU student. Your first name and photo unlock when you&apos;re within about 30 feet of each other. Your school email stays private.
      </Notice>
    </Screen>
  );
}

function IdThumb({ label, image, onPress }: { label: string; image: PickedImage | null; onPress: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.flex}>
      {image ? (
        <Image source={{ uri: image.uri }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty, { borderColor: theme.border, backgroundColor: theme.background }]}>
          <Ionicons name={label === 'Selfie' ? 'happy-outline' : 'card-outline'} size={28} color={theme.textSecondary} />
        </View>
      )}
      <Button compact variant="secondary" icon="camera-outline" title={image ? `Retake ${label.toLowerCase()}` : label} onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  brandRow: { gap: 4 },
  flex: {
    flex: 1,
    gap: Spacing.one,
  },
  center: {
    textAlign: 'center',
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
  links: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  idRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  thumb: {
    height: 96,
    borderRadius: Radius.md,
    marginBottom: Spacing.one,
  },
  thumbEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
