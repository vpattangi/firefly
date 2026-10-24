import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  /** `secondary` is the outlined button from the design. */
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  compact?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  left?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, variant = 'primary', loading, compact, disabled, icon, left, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const background = {
    primary: theme.accent,
    secondary: theme.backgroundElement,
    danger: theme.danger,
  }[variant];
  const foreground = variant === 'secondary' ? theme.accent : theme.onAccent;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        { backgroundColor: background, opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: theme.border },
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {left}
          {icon && <Ionicons name={icon} size={compact ? 16 : 20} color={foreground} />}
          <Text style={[compact ? styles.compactText : styles.text, { color: foreground }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  compact: {
    minHeight: 38,
    paddingHorizontal: Spacing.three,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
  compactText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
