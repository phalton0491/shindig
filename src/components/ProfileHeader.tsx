import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { UserProfile } from '../types/models';
import { theme } from '../theme';

type ProfileHeaderProps = {
  onOpenFriends?: () => void;
  profile: UserProfile;
};

export function ProfileHeader({ onOpenFriends, profile }: ProfileHeaderProps) {
  return (
    <View style={styles.shell}>
      <View style={styles.heroCard}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTopRow}>
          <View style={styles.avatarRing}>
            <Image source={{ uri: profile.avatar }} style={styles.avatar} />
            <View style={styles.onlineDot} />
          </View>
          <View style={styles.identityBlock}>
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.handle}>{profile.handle}</Text>
            <Text style={styles.city}>{profile.city}</Text>
          </View>
        </View>

        <Text style={styles.bio}>{profile.bio}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile.stats.shindigs}</Text>
            <Text style={styles.statLabel}>ShinDigs</Text>
          </View>
          <Pressable onPress={onOpenFriends} style={styles.statCard}>
            <Text style={styles.statValue}>{profile.stats.friends}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  heroCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
    borderRadius: 30,
    borderWidth: 1,
    overflow: 'hidden',
    padding: theme.spacing.lg,
    shadowColor: '#000000',
    shadowOffset: {
      height: 12,
      width: 0,
    },
    shadowOpacity: 0.3,
    shadowRadius: 26,
  },
  heroGlow: {
    backgroundColor: theme.colors.accentGlow,
    borderRadius: theme.radius.round,
    height: 170,
    left: -40,
    position: 'absolute',
    top: -70,
    width: 170,
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  avatarRing: {
    borderColor: 'rgba(165, 110, 255, 0.8)',
    borderRadius: theme.radius.round,
    borderWidth: 2,
    marginRight: theme.spacing.md,
    padding: 1,
    position: 'relative',
  },
  avatar: {
    borderRadius: theme.radius.round,
    height: 86,
    width: 86,
  },
  onlineDot: {
    backgroundColor: theme.colors.success,
    borderColor: theme.colors.surface,
    borderRadius: theme.radius.round,
    borderWidth: 3,
    bottom: 2,
    height: 16,
    position: 'absolute',
    right: 4,
    width: 16,
  },
  identityBlock: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  name: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 32,
  },
  handle: {
    color: theme.colors.accentPink,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 6,
  },
  city: {
    color: theme.colors.textMuted,
    fontSize: 15,
    marginTop: 4,
  },
  bio: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
    marginTop: theme.spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  statCard: {
    backgroundColor: 'rgba(27, 38, 66, 0.88)',
    borderColor: theme.colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
  },
  statValue: {
    color: '#DDB5FF',
    fontSize: 28,
    fontWeight: '800',
  },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    textTransform: 'uppercase',
  },
});
