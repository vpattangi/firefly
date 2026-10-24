// Firefly brand pieces: the little firefly mark, the "firefly." wordmark (Abril Fatface),
// the "find your sparkle" tagline, and the "searching for your sparkle" loader whose dots are sparkles.

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

/** Loaded in app/_layout.tsx with expo-font. Falls back to the system serif until it's ready. */
export const LOGO_FONT = 'AbrilFatface_400Regular';

const navy = Colors.light.navy;
const amber = Colors.light.amber;

/** Little firefly: white wings, navy body, glowing tail. Plain Views, so no extra packages. */
export function FireflyIcon({ size = 20, color = navy }: { size?: number; color?: string }) {
  const S = size;
  const centered = (w: number) => (S - w) / 2;
  const antenna = Math.max(1.5, S * 0.07);

  return (
    <View style={{ width: S, height: S }} accessible={false}>
      <View style={[styles.abs, { width: S * 0.52, height: S * 0.52, borderRadius: S, left: centered(S * 0.52), top: S * 0.47, backgroundColor: 'rgba(255,255,255,0.45)' }]} />
      <View style={[styles.abs, { width: S * 0.42, height: S * 0.26, borderRadius: S, left: S * 0.07, top: S * 0.24, backgroundColor: 'rgba(255,255,255,0.92)', transform: [{ rotate: '-28deg' }] }]} />
      <View style={[styles.abs, { width: S * 0.42, height: S * 0.26, borderRadius: S, right: S * 0.07, top: S * 0.24, backgroundColor: 'rgba(255,255,255,0.92)', transform: [{ rotate: '28deg' }] }]} />
      <View style={[styles.abs, { width: S * 0.3, height: S * 0.5, borderRadius: S * 0.15, left: centered(S * 0.3), top: S * 0.2, backgroundColor: color }]} />
      <View style={[styles.abs, { width: S * 0.24, height: S * 0.24, borderRadius: S, left: centered(S * 0.24), top: S * 0.08, backgroundColor: color }]} />
      <View
        style={[
          styles.abs,
          {
            width: S * 0.26,
            height: S * 0.26,
            borderRadius: S,
            left: centered(S * 0.26),
            top: S * 0.6,
            backgroundColor: '#FFFBE0',
            shadowColor: '#FFF3B0',
            shadowOpacity: 1,
            shadowRadius: S * 0.2,
            shadowOffset: { width: 0, height: 0 },
          },
        ]}
      />
      <View style={[styles.abs, { width: antenna, height: S * 0.16, left: S / 2 - S * 0.09, top: 0, backgroundColor: color, transform: [{ rotate: '-30deg' }] }]} />
      <View style={[styles.abs, { width: antenna, height: S * 0.16, left: S / 2 + S * 0.09 - antenna, top: 0, backgroundColor: color, transform: [{ rotate: '30deg' }] }]} />
    </View>
  );
}

/** Amber tile with the firefly, next to the "firefly." wordmark. `light` is for the navy hero. */
export function Logo({ size = 24, light = false }: { size?: number; light?: boolean }) {
  const tile = Math.round(size * 1.35);
  return (
    <View style={styles.logoRow} accessibilityRole="header" accessibilityLabel="Firefly">
      <View style={[styles.tile, { width: tile, height: tile, borderRadius: tile * 0.25, backgroundColor: amber }]}>
        <FireflyIcon size={Math.round(tile * 0.7)} />
      </View>
      <Text style={[styles.wordmark, { fontSize: size, lineHeight: size * 1.25, color: light ? '#FFFFFF' : navy }]}>firefly.</Text>
    </View>
  );
}

/** "find your sparkle" with a little sparkle. */
export function Tagline({ light = false, size = 14 }: { light?: boolean; size?: number }) {
  return (
    <View style={styles.taglineRow}>
      <Ionicons name="sparkles" size={size} color={amber} />
      <Text style={[styles.tagline, { fontSize: size, color: light ? '#FFFFFF' : navy }]}>find your sparkle</Text>
    </View>
  );
}

/** "searching for your sparkle" followed by three small sparkles that twinkle one after another. */
export function SparkleLoader({ label = 'searching for your sparkle', size = 16 }: { label?: string; size?: number }) {
  const [twinkles] = useState(() => [0, 1, 2].map(() => new Animated.Value(0.2)));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.stagger(
        220,
        twinkles.map((v) =>
          Animated.sequence([
            Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: true }),
            Animated.timing(v, { toValue: 0.2, duration: 320, useNativeDriver: true }),
          ])
        )
      )
    );
    loop.start();
    return () => loop.stop();
  }, [twinkles]);

  return (
    <View style={styles.loaderRow} accessibilityRole="progressbar" accessibilityLabel={label}>
      <Text style={[styles.loaderText, { fontSize: size }]}>{label}</Text>
      {twinkles.map((v, i) => (
        <Animated.View key={i} style={{ opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0.2, 1], outputRange: [0.7, 1.15] }) }] }}>
          <Ionicons name="sparkles" size={Math.round(size * 0.7)} color={amber} />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tile: { alignItems: 'center', justifyContent: 'center' },
  wordmark: { fontFamily: LOGO_FONT },
  taglineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tagline: { fontWeight: '600', letterSpacing: 0.2 },
  loaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6 },
  loaderText: { color: navy, fontWeight: '600', marginRight: 4 },
});
