import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '../components/PageHeader';
import { theme } from '../theme';

type MoreScreenProps = {
  headerActions?: React.ReactNode;
  onBack: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void | Promise<void>;
};

export function MoreScreen({
  headerActions,
  onBack,
  onOpenSettings,
  onSignOut,
}: MoreScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader onBack={onBack} right={headerActions} title="Settings" />

        <View style={styles.list}>
          <Pressable onPress={onOpenSettings} style={styles.row}>
            <Text style={styles.rowText}>User settings</Text>
            <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={20} />
          </Pressable>
          <Pressable onPress={onSignOut} style={styles.row}>
            <Text style={styles.rowText}>Sign out</Text>
            <Ionicons color={theme.colors.textMuted} name="log-out-outline" size={20} />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
  },
  list: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    marginTop: theme.spacing.xl,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  rowText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
});
