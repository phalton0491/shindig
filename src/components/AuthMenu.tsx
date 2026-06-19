import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

type AuthMenuProps = {
  onOpenSettings: () => void;
  onSignOut: () => void | Promise<void>;
};

export function AuthMenu({ onOpenSettings, onSignOut }: AuthMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  function handleOpenSettings() {
    setIsOpen(false);
    onOpenSettings();
  }

  async function handleSignOut() {
    setIsOpen(false);
    await onSignOut();
  }

  return (
    <View pointerEvents="box-none" style={styles.shell}>
      <Pressable onPress={() => setIsOpen((current) => !current)} style={styles.button}>
        <Text style={styles.buttonText}>☰</Text>
      </Pressable>
      {isOpen ? (
        <View style={styles.menu}>
          <Pressable onPress={handleOpenSettings} style={styles.menuItem}>
            <Text style={styles.menuText}>User settings</Text>
          </Pressable>
          <Pressable onPress={handleSignOut} style={styles.menuItem}>
            <Text style={styles.menuText}>Sign out</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    right: 16,
    top: 16,
    zIndex: 20,
  },
  button: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.round,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  buttonText: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  menu: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    marginTop: 8,
    minWidth: 176,
    overflow: 'hidden',
  },
  menuItem: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  menuText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
});
