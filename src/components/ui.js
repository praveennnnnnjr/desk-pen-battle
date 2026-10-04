/** Small shared UI primitives. */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing } from '../config/theme';

export function Button({ title, onPress, variant = 'primary', disabled, loading, style, icon, testID }) {
  const v = VARIANTS[variant] || VARIANTS.primary;
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && !inactive && { transform: [{ translateY: 2 }], opacity: 0.92 },
        inactive && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <Text style={[styles.btnText, { color: v.fg }]}>
          {icon ? `${icon}  ` : ''}
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const VARIANTS = {
  primary: { bg: colors.accent, fg: colors.ink, border: '#C98F3A' },
  blue: { bg: colors.p1, fg: '#fff', border: '#1E3FB8' },
  red: { bg: colors.p2, fg: '#fff', border: '#A82E33' },
  ghost: { bg: 'transparent', fg: colors.textOnDark, border: 'rgba(246,235,221,0.35)' },
  light: { bg: colors.surface, fg: colors.ink, border: colors.surfaceMuted },
};

export const Field = React.forwardRef(function Field({ label, error, style, ...props }, ref) {
  return (
    <View style={[{ marginBottom: spacing(3) }, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.inkMuted}
        style={[styles.input, error && { borderColor: colors.danger }]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
});

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderBottomWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing(5),
  },
  btnText: { fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  label: { color: colors.inkMuted, fontWeight: '700', marginBottom: spacing(1.5), fontSize: 13 },
  input: {
    backgroundColor: '#FFFDF9',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(3),
    fontSize: 16,
    color: colors.ink,
  },
  error: { color: colors.danger, marginTop: spacing(1), fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing(5),
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
