import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

type AuthMenuProps = {
  notificationCount: number;
  onOpenMenu: () => void;
  onOpenNotifications: () => void;
};

export function AuthMenu({
  notificationCount,
  onOpenMenu,
  onOpenNotifications,
}: AuthMenuProps) {
  return (
    <View pointerEvents="box-none" style={styles.shell}>
      <View style={styles.row}>
        <Pressable onPress={onOpenNotifications} style={styles.button}>
          <Text style={styles.buttonText}>🔔</Text>
          {notificationCount > 0 ? (
            <View style={styles.dot} />
          ) : null}
        </Pressable>
        <Pressable onPress={onOpenMenu} style={styles.button}>
          <View style={styles.hamburger}>
            <View style={styles.hamburgerLine} />
            <View style={styles.hamburgerLine} />
            <View style={styles.hamburgerLine} />
          </View>
        </Pressable>
      </View>
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
});
