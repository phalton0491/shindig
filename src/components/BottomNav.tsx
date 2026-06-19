import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

export type AppTab = 'friends' | 'home' | 'profile' | 'shindigs';

type BottomNavProps = {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
};

const TABS: Array<{ icon: string; key: AppTab; label: string }> = [
  { icon: '⌂', key: 'home', label: 'Home' },
  { icon: '◎', key: 'friends', label: 'Friends' },
  { icon: '✚', key: 'shindigs', label: 'Shindigs' },
  { icon: '☺', key: 'profile', label: 'Profile' },
];

export function BottomNav({ activeTab, onSelectTab }: BottomNavProps) {
  return (
    <View style={styles.shell}>
      <View style={styles.bar}>
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;

          return (
            <Pressable
              key={tab.key}
              onPress={() => onSelectTab(tab.key)}
              style={styles.tab}
            >
              <Text style={[styles.icon, isActive && styles.iconActive]}>{tab.icon}</Text>
              <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: theme.colors.background,
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    paddingBottom: 10,
    paddingHorizontal: theme.spacing.md,
    paddingTop: 8,
  },
  bar: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    paddingVertical: 4,
  },
  icon: {
    color: theme.colors.textMuted,
    fontSize: 18,
    fontWeight: '700',
  },
  iconActive: {
    color: '#FF615A',
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  labelActive: {
    color: '#FF615A',
  },
});
