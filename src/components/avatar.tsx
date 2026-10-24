import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useAvatarUrl } from '@/lib/images';

type AvatarProps = {
  path: string | null | undefined;
  name: string | null | undefined;
  size?: number;
  /** Local image (e.g. freshly picked) shown instead of fetching from storage. */
  localUri?: string;
};

export function Avatar({ path, name, size = 48, localUri }: AvatarProps) {
  const theme = useTheme();
  const remoteUrl = useAvatarUrl(localUri ? null : path);
  const uri = localUri ?? remoteUrl;
  const shape = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image source={{ uri }} style={shape} contentFit="cover" />;
  }

  // No photo, or it isn't shared with you yet — show initials.
  return (
    <View style={[styles.fallback, shape, { backgroundColor: theme.amberSoft }]}>
      <ThemedText type="smallBold" style={{ fontSize: size * 0.4, lineHeight: size * 0.5, color: theme.navy }}>
        {(name ?? '?').slice(0, 1).toUpperCase()}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
