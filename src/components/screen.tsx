import { Ionicons } from '@expo/vector-icons';
import type { PropsWithChildren, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = PropsWithChildren<{
  /** Extra bottom padding so content clears the tab bar. */
  bottomInset?: number;
  /** Set false when a native header already handles the top safe area. */
  safeTop?: boolean;
  /** Large page title, as in the design. */
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  /** Pinned below the scroll area (e.g. the main action button). */
  footer?: ReactNode;
}>;

export function Screen({ children, bottomInset = 0, safeTop = true, title, subtitle, headerRight, footer }: ScreenProps) {
  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={safeTop ? ['top', 'left', 'right'] : ['left', 'right']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {title && <Header title={title} subtitle={subtitle} right={headerRight} />}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.content, title && styles.contentUnderHeader, { paddingBottom: bottomInset + Spacing.five }]}>
            {children}
          </ScrollView>
          {footer && <View style={styles.footer}>{footer}</View>}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.flex}>
        <ThemedText type="subtitle">{title}</ThemedText>
        {subtitle && <ThemedText themeColor="textSecondary">{subtitle}</ThemedText>}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }, style]}>
      {children}
    </ThemedView>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
          props.multiline && styles.multiline,
          style,
        ]}
        {...props}
      />
    </View>
  );
}

/** Soft navy-tint info box with an icon (privacy notes, disclaimers). */
export function Notice({ icon, children }: PropsWithChildren<{ icon: keyof typeof Ionicons.glyphMap }>) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundSelected" style={styles.notice}>
      <Ionicons name={icon} size={18} color={theme.accent} />
      <ThemedText type="small" style={styles.flex}>
        {children}
      </ThemedText>
    </ThemedView>
  );
}

export function RoundIcon({
  name,
  size = 40,
  color,
  onPress,
}: {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={8}
      style={[
        styles.round,
        { width: size, height: size, borderRadius: size / 2, borderColor: theme.border, backgroundColor: theme.backgroundElement },
      ]}>
      <Ionicons name={name} size={size * 0.5} color={color ?? theme.text} />
    </Pressable>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <ThemedText type="small" themeColor="danger">
      {message}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.four - 4,
    paddingTop: Spacing.three - 4,
    paddingBottom: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  content: {
    padding: Spacing.four - 4,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  contentUnderHeader: {
    paddingTop: Spacing.one,
  },
  footer: {
    paddingHorizontal: Spacing.four - 4,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  card: {
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.two,
  },
  field: {
    gap: 6,
  },
  input: {
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  multiline: {
    minHeight: 96,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  notice: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: Radius.md,
    padding: 14,
    alignItems: 'flex-start',
  },
  round: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
