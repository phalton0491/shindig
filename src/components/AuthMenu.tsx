import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

type AuthMenuProps = {
  notificationCount: number;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void | Promise<void>;
};

export function AuthMenu({
  notificationCount,
  onOpenNotifications,
  onOpenSettings,
  onSignOut,
}: AuthMenuProps) {
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
      <View style={styles.row}>
        <Pressable onPress={onOpenNotifications} style={styles.button}>
          <Text style={styles.buttonText}>🔔</Text>
          {notificationCount > 0 ? (
            <View style={styles.dot} />
          ) : null}
        </Pressable>
        <Pressable onPress={() => setIsOpen((current) => !current)} style={styles.button}>
          <View style={styles.hamburger}>
            <View style={styles.hamburgerLine} />
            <View style={styles.hamburgerLine} />
            <View style={styles.hamburgerLine} />
          </View>
        </Pressable>
      </View>
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
    top: Platform.OS === 'ios' ? 44 : 20,
    zIndex: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  button: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    position: 'relative',
    width: 44,
  },
  buttonText: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  dot: {
    backgroundColor: '#FF615A',
    borderRadius: theme.radius.round,
    height: 10,
    position: 'absolute',
    right: 6,
    top: 6,
    width: 10,
  },
  hamburger: {
    gap: 4,
    width: 18,
  },
  hamburgerLine: {
    backgroundColor: theme.colors.textPrimary,
    borderRadius: 999,
    height: 2,
    width: '100%',
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
