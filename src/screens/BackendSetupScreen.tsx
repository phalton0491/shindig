import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

export function BackendSetupScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.card}>
        <Text style={styles.title}>Backend setup required</Text>
        <Text style={styles.copy}>
          Add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
          to your local `.env`, then create the `profiles` table from
          `supabase/schema.sql`.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    padding: theme.spacing.xl,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  copy: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    marginTop: theme.spacing.md,
  },
});
