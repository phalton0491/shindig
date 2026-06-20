import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  normalizeEmail,
  normalizeLoginIdentifier,
  normalizeUsername,
  signInWithEmailOrUsername,
  signUpWithUsername,
  validateEmail,
  validateUsername,
} from '../lib/auth';
import { isUsernameAvailable } from '../lib/profiles';
import { theme } from '../theme';

const AUTH_LOGO = require('../../assets/auth-logo.png');

type AuthScreenProps = {
  bootError?: string;
  initialMode?: AuthMode;
};

type AuthMode = 'signup' | 'login';

type SignUpForm = {
  email: string;
  firstName: string;
  loginIdentifier: string;
  lastName: string;
  password: string;
  username: string;
};

const emptyForm: SignUpForm = {
  email: '',
  firstName: '',
  loginIdentifier: '',
  lastName: '',
  password: '',
  username: '',
};

export function AuthScreen({
  bootError,
  initialMode = 'login',
}: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [form, setForm] = useState<SignUpForm>(emptyForm);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<{
    isChecking: boolean;
    isValid: boolean;
    message: string;
  }>({
    isChecking: false,
    isValid: false,
    message: '',
  });

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (mode !== 'signup') {
      setUsernameStatus({
        isChecking: false,
        isValid: false,
        message: '',
      });
      return;
    }

    const nextUsername = normalizeUsername(form.username);
    if (!nextUsername) {
      setUsernameStatus({
        isChecking: false,
        isValid: false,
        message: '',
      });
      return;
    }

    try {
      validateUsername(nextUsername);
    } catch (validationError) {
      setUsernameStatus({
        isChecking: false,
        isValid: false,
        message:
          validationError instanceof Error
            ? validationError.message
            : 'Enter a valid username.',
      });
      return;
    }

    setUsernameStatus({
      isChecking: true,
      isValid: false,
      message: 'Checking username...',
    });

    let isActive = true;
    const timeoutId = setTimeout(async () => {
      try {
        const available = await isUsernameAvailable(nextUsername);
        if (!isActive) {
          return;
        }

        setUsernameStatus({
          isChecking: false,
          isValid: available,
          message: available ? 'Username available.' : 'Username already taken.',
        });
      } catch {
        if (!isActive) {
          return;
        }

        setUsernameStatus({
          isChecking: false,
          isValid: false,
          message: 'Could not verify username right now.',
        });
      }
    }, 250);

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [form.username, mode]);

  const isFormComplete = useMemo(() => {
    if (mode === 'login') {
      return form.loginIdentifier.trim().length > 0 && form.password.trim().length > 0;
    }

    return (
      form.email.trim().length > 0 &&
      form.firstName.trim().length > 0 &&
      form.lastName.trim().length > 0 &&
      form.password.trim().length > 0 &&
      form.username.trim().length > 0
    );
  }, [form, mode]);

  const isSubmitDisabled =
    isSubmitting ||
    !isFormComplete ||
    (mode === 'signup' && (!usernameStatus.isValid || usernameStatus.isChecking));

  function updateField(field: keyof SignUpForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleFormSubmit() {
    if (!isFormComplete) {
      setError('Complete each field before continuing.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setInfo('');

    try {
      if (mode === 'login') {
        await signInWithEmailOrUsername(form.loginIdentifier, form.password);
      } else {
        const username = validateUsername(form.username);
        const email = validateEmail(form.email);
        const usernameAvailable = await isUsernameAvailable(username);

        if (!usernameAvailable) {
          setUsernameStatus({
            isChecking: false,
            isValid: false,
            message: 'Username already taken.',
          });
          throw new Error('Choose a different username.');
        }

        const result = await signUpWithUsername({
          email,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          password: form.password,
          username,
        });

        if (!result.session) {
          setInfo('Account created. Check your email if confirmation is enabled in Supabase.');
        }
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Image source={AUTH_LOGO} style={styles.logo} />
            <Text style={styles.title}>Track every day out and night out.</Text>
          </View>

          <View style={styles.authCard}>
            <View style={styles.modeRow}>
              <Pressable
                onPress={() => setMode('signup')}
                style={[styles.modePill, mode === 'signup' && styles.modePillActive]}
              >
                <Text
                  style={[styles.modePillText, mode === 'signup' && styles.modePillTextActive]}
                >
                  Sign up
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMode('login')}
                style={[styles.modePill, mode === 'login' && styles.modePillActive]}
              >
                <Text
                  style={[styles.modePillText, mode === 'login' && styles.modePillTextActive]}
                >
                  Log in
                </Text>
              </Pressable>
            </View>

            <View style={styles.formGrid}>
              {mode === 'signup' ? (
                <>
                  <TextInput
                    autoCapitalize="none"
                    keyboardType="email-address"
                    onChangeText={(value) =>
                      updateField('email', normalizeEmail(value))
                    }
                    placeholder="Email"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.input}
                    value={form.email}
                  />
                  <TextInput
                    autoCapitalize="words"
                    onChangeText={(value) => updateField('firstName', value)}
                    placeholder="First name"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.input}
                    value={form.firstName}
                  />
                  <TextInput
                    autoCapitalize="words"
                    onChangeText={(value) => updateField('lastName', value)}
                    placeholder="Last name"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.input}
                    value={form.lastName}
                  />
                </>
              ) : (
                <TextInput
                  autoCapitalize="none"
                  onChangeText={(value) =>
                    updateField('loginIdentifier', normalizeLoginIdentifier(value))
                  }
                  placeholder="Email or username"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.input}
                  value={form.loginIdentifier}
                />
              )}
              {mode === 'signup' ? (
                <TextInput
                  autoCapitalize="none"
                  onChangeText={(value) =>
                    updateField('username', normalizeUsername(value))
                  }
                  placeholder="Username"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.input}
                  value={form.username}
                />
              ) : null}
              <TextInput
                autoCapitalize="none"
                onChangeText={(value) => updateField('password', value)}
                placeholder="Password"
                placeholderTextColor={theme.colors.textMuted}
                secureTextEntry
                style={styles.input}
                value={form.password}
              />
            </View>

            {mode === 'signup' && usernameStatus.message ? (
              <Text
                style={
                  usernameStatus.isValid
                    ? styles.infoText
                    : usernameStatus.isChecking
                      ? styles.pendingText
                      : styles.errorText
                }
              >
                {usernameStatus.message}
              </Text>
            ) : null}

            {bootError ? <Text style={styles.errorText}>{bootError}</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {info ? <Text style={styles.infoText}>{info}</Text> : null}

            <Pressable
              disabled={isSubmitDisabled}
              onPress={handleFormSubmit}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                isSubmitDisabled && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {mode === 'signup' ? 'Create account' : 'Log in'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  hero: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  logo: {
    height: 180,
    marginBottom: theme.spacing.md,
    resizeMode: 'contain',
    width: 260,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 38,
    fontWeight: '700',
    letterSpacing: -1.2,
    lineHeight: 42,
    maxWidth: 320,
    textAlign: 'center',
  },
  authCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    padding: theme.spacing.lg,
  },
  modeRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  modePill: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.round,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  modePillActive: {
    backgroundColor: theme.colors.accent,
  },
  modePillText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  modePillTextActive: {
    color: '#20140F',
  },
  formGrid: {
    gap: theme.spacing.sm,
  },
  input: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    color: theme.colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  errorText: {
    color: '#FF9F8A',
    marginTop: theme.spacing.sm,
  },
  infoText: {
    color: theme.colors.accentSoft,
    marginTop: theme.spacing.sm,
  },
  pendingText: {
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.lg,
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  primaryButtonText: {
    color: '#20140F',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
