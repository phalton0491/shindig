import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

type MoreScreenProps = {
  onBack: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void | Promise<void>;
};

export function MoreScreen({
  onBack,
  onOpenSettings,
  onSignOut,
}: MoreScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Ionicons color={theme.colors.textPrimary} name="chevron-back" size={28} />
          </Pressable>
          <Text style={styles.title}>User Settings</Text>
          <View style={styles.topSpacer} />
        </View>

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
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backButton: {
    alignItems: 'center',
    height: 52,
    justifyContent: 'center',
    marginLeft: -14,
    width: 52,
  },
  topSpacer: {
    width: 52,
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
