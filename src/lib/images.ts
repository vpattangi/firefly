import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type PickedImage = { uri: string; base64: string };

export async function pickImage(options: {
  source: 'camera' | 'library';
  square?: boolean;
  frontCamera?: boolean;
}): Promise<PickedImage | null> {
  const pickerOptions: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: options.square,
    aspect: options.square ? [1, 1] : undefined,
    quality: 0.6,
    base64: true,
    cameraType: options.frontCamera ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  };

  let result: ImagePicker.ImagePickerResult;
  if (options.source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Camera permission is needed to take this photo');
    result = await ImagePicker.launchCameraAsync(pickerOptions);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
  }

  const asset = result.canceled ? null : result.assets[0];
  if (!asset?.base64) return null;
  return { uri: asset.uri, base64: asset.base64 };
}

export async function uploadImage(bucket: 'avatars' | 'id-documents' | 'report-photos', path: string, image: PickedImage) {
  const bytes = Uint8Array.from(atob(image.base64), (c) => c.charCodeAt(0));
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: bucket === 'avatars' });
  if (error) throw new Error(error.message);
  return path;
}

/**
 * Signed URL for a private avatar. Storage RLS only signs it for the owner or
 * someone who confirmed the same walking group, so this returns null otherwise.
 */
export function useAvatarUrl(path: string | null | undefined) {
  const [signed, setSigned] = useState<{ path: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    supabase.storage
      .from('avatars')
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (!cancelled) setSigned({ path, url: data?.signedUrl ?? null });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return path && signed?.path === path ? signed.url : null;
}
