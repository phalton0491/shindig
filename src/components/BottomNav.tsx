import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

export type AppTab = 'friends' | 'home' | 'profile' | 'shindigs';

type BottomNavProps = {
  activeTab: AppTab | null;
  onCreateShindig: () => void;
  onSelectTab: (tab: AppTab) => void;
};

const TABS: Array<{
  activeIcon: keyof typeof Ionicons.glyphMap;
  icon: keyof typeof Ionicons.glyphMap;
  key: AppTab;
  label: string;
}> = [
  { activeIcon: 'home', icon: 'home-outline', key: 'home', label: 'Home' },
  { activeIcon: 'people', icon: 'people-outline', key: 'friends', label: 'Friends' },
  { activeIcon: 'grid', icon: 'grid-outline', key: 'shindigs', label: 'Shindigs' },
  { activeIcon: 'happy', icon: 'happy-outline', key: 'profile', label: 'Profile' },
];

export function BottomNav({ activeTab, onCreateShindig, onSelectTab }: BottomNavProps) {
  return (
    <View style={styles.shell}>
      <View style={styles.bar}>
        {TABS.slice(0, 2).map((tab) => {
          const isActive = tab.key === activeTab;

          return (
            <Pressable key={tab.key} onPress={() => onSelectTab(tab.key)} style={styles.tab}>
              <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
                <Ionicons
                  color={isActive ? theme.colors.accentPink : theme.colors.textMuted}
                  name={isActive ? tab.activeIcon : tab.icon}
                  size={18}
                />
              </View>
              <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}

        <Pressable onPress={onCreateShindig} style={styles.createTab}>
          <View style={styles.createButton}>
            <Ionicons color="#FFFFFF" name="add" size={24} />
          </View>
        </Pressable>

        {TABS.slice(2).map((tab) => {
          const isActive = tab.key === activeTab;

          return (
            <Pressable key={tab.key} onPress={() => onSelectTab(tab.key)} style={styles.tab}>
              <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
                <Ionicons
                  color={isActive ? theme.colors.accentPink : theme.colors.textMuted}
                  name={isActive ? tab.activeIcon : tab.icon}
                  size={18}
                />
              </View>
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
    paddingBottom: 12,
    paddingHorizontal: theme.spacing.md,
    paddingTop: 6,
  },
  bar: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(18, 28, 51, 0.95)',
    borderColor: theme.colors.borderStrong,
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    shadowColor: '#020611',
    shadowOffset: {
      height: 12,
      width: 0,
    },
    shadowOpacity: 0.42,
    shadowRadius: 24,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    gap: 5,
    paddingVertical: 2,
  },
  iconWrap: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    minWidth: 28,
  },
  iconWrapActive: {
    shadowColor: theme.colors.accentPink,
    shadowOffset: {
      height: 0,
      width: 0,
    },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  createTab: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -24,
    width: 68,
  },
  createButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentPink,
    borderColor: 'rgba(255, 196, 184, 0.5)',
    borderRadius: theme.radius.round,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    shadowColor: theme.colors.accentPink,
    shadowOffset: {
      height: 8,
      width: 0,
    },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    width: 54,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  labelActive: {
    color: '#FFFFFF',
  },
});
