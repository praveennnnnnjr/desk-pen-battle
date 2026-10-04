import React, { useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Field } from '../components/ui';
import { colors, radius, spacing } from '../config/theme';
import { useAuth } from '../context/AuthContext';
import { friendlyAuthError, validateCredentials } from '../services/auth';

export default function AuthScreen() {
  const { signIn, signUp, resetPassword, backend } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  const switchMode = (m) => {
    setMode(m);
    setErrors({});
    setFormError('');
  };

  const submit = async () => {
    const v = validateCredentials({ email, password, confirm, mode });
    setErrors(v);
    setFormError('');
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      if (mode === 'login') await signIn(email, password);
      else await signUp(email, password, name);
      // Navigation switches to the menu automatically once `user` is set.
    } catch (e) {
      setFormError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) {
      setErrors({ email: 'Enter your email above first.' });
      return;
    }
    try {
      await resetPassword(email);
      Alert.alert('Check your inbox', 'We sent you a link to reset your password.');
    } catch (e) {
      Alert.alert('Password reset', friendlyAuthError(e));
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Image source={require('../../assets/adaptive-icon.png')} style={styles.logo} />
            <Text style={styles.title}>DESK BATTLE</Text>
            <Text style={styles.subtitle}>Pen Clash</Text>
          </View>

          <Card>
            <View style={styles.tabs}>
              {['login', 'signup'].map((m) => (
                <Pressable
                  key={m}
                  onPress={() => switchMode(m)}
                  style={[styles.tab, mode === m && styles.tabActive]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: mode === m }}
                >
                  <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
                    {m === 'login' ? 'Log in' : 'Sign up'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {mode === 'signup' && (
              <Field
                label="Player name (optional)"
                value={name}
                onChangeText={setName}
                placeholder="e.g. InkSlinger"
                maxLength={20}
                autoCapitalize="words"
              />
            )}
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              error={errors.email}
            />
            <Field
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              secureTextEntry
              autoCapitalize="none"
              autoComplete={mode === 'login' ? 'password' : 'new-password'}
              textContentType={mode === 'login' ? 'password' : 'newPassword'}
              returnKeyType={mode === 'login' ? 'go' : 'next'}
              onSubmitEditing={() => (mode === 'login' ? submit() : confirmRef.current?.focus())}
              error={errors.password}
            />
            {mode === 'signup' && (
              <Field
                ref={confirmRef}
                label="Confirm password"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                autoCapitalize="none"
                returnKeyType="go"
                onSubmitEditing={submit}
                error={errors.confirm}
              />
            )}

            {formError ? <Text style={styles.formError}>{formError}</Text> : null}

            <Button
              title={mode === 'login' ? 'Log in' : 'Create account'}
              onPress={submit}
              loading={busy}
              testID="auth-submit"
            />

            {mode === 'login' && backend === 'firebase' && (
              <Pressable onPress={forgot} style={styles.forgot}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
            )}
          </Card>

          {backend === 'local' && (
            <Text style={styles.demo}>
              Demo mode: accounts are saved on this device only. Add your Firebase keys to enable real accounts and
              online multiplayer.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing(5) },
  hero: { alignItems: 'center', marginBottom: spacing(6) },
  logo: { width: 120, height: 120 },
  title: { color: colors.textOnDark, fontSize: 34, fontWeight: '900', letterSpacing: 2 },
  subtitle: { color: colors.accent, fontSize: 18, fontWeight: '700', marginTop: 2 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: spacing(5),
  },
  tab: { flex: 1, paddingVertical: spacing(2.5), borderRadius: radius.pill, alignItems: 'center' },
  tabActive: { backgroundColor: colors.ink },
  tabText: { fontWeight: '800', color: colors.inkMuted },
  tabTextActive: { color: colors.surface },
  formError: { color: colors.danger, marginBottom: spacing(3), textAlign: 'center', fontWeight: '600' },
  forgot: { alignItems: 'center', marginTop: spacing(4) },
  forgotText: { color: colors.inkMuted, fontWeight: '700', textDecorationLine: 'underline' },
  demo: { color: colors.textOnDarkMuted, textAlign: 'center', marginTop: spacing(5), fontSize: 13, lineHeight: 19 },
});
