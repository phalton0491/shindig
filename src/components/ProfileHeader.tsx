import { Image, StyleSheet, Text, View } from 'react-native';

import { UserProfile } from '../data/mockProfile';
import { theme } from '../theme';

type ProfileHeaderProps = {
  profile: UserProfile;
};

export function ProfileHeader({ profile }: ProfileHeaderProps) {
  return (
    <View style={styles.shell}>
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <Image source={{ uri: profile.avatar }} style={styles.avatar} />
          <View style={styles.identityBlock}>
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.handle}>{profile.handle}</Text>
            <Text style={styles.city}>{profile.city}</Text>
          </View>
        </View>

        <Text style={styles.bio}>{profile.bio}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile.stats.outings}</Text>
            <Text style={styles.statLabel}>Outings</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile.stats.friends}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile.stats.saves}</Text>
            <Text style={styles.statLabel}>Saves</Text>
          </View>
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
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    padding: theme.spacing.lg,
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  avatar: {
    borderRadius: theme.radius.round,
    height: 84,
    marginRight: theme.spacing.md,
    width: 84,
  },
  identityBlock: {
    flex: 1,
  },
  name: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  handle: {
    color: theme.colors.accentSoft,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  city: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginTop: theme.spacing.xs,
  },
  bio: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: theme.spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  statCard: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.lg,
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  statValue: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
  },
});
