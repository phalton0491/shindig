import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '../theme';

type AuthMenuProps = {
  chatCount: number;
  notificationCount: number;
  onOpenChats: () => void;
  onOpenMenu: () => void;
  onOpenNotifications: () => void;
};

export function AuthMenu({
  chatCount,
  notificationCount,
  onOpenChats,
  onOpenMenu,
  onOpenNotifications,
}: AuthMenuProps) {
  return (
    <View style={styles.row}>
      <Pressable onPress={onOpenNotifications} style={styles.button}>
        <Ionicons color="#FFD77A" name="notifications" size={22} />
        {notificationCount > 0 ? <View style={styles.dot} /> : null}
      </Pressable>
      <Pressable onPress={onOpenChats} style={styles.button}>
        <Ionicons color={theme.colors.textPrimary} name="chatbubble-ellipses-outline" size={21} />
        {chatCount > 0 ? <View style={styles.dot} /> : null}
      </Pressable>
      <Pressable onPress={onOpenMenu} style={styles.button}>
        <View style={styles.hamburger}>
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    alignItems: 'center',
    backgroundColor: 'rgba(14, 22, 40, 0.88)',
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.round,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    position: 'relative',
    width: 46,
  },
  dot: {
    backgroundColor: theme.colors.accentPink,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 2.5,
    width: '100%',
  },
});
