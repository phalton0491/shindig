import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AlbumCard } from '../components/AlbumCard';
import { theme } from '../theme';
import { FeedShindig, UserProfile } from '../types/models';

type HomeFeedScreenProps = {
  feedShindigs: FeedShindig[];
  onOpenProfile: () => void;
  profile: UserProfile;
};

export function HomeFeedScreen({
  feedShindigs,
  onOpenProfile,
  profile,
}: HomeFeedScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.kicker}>SHINDIG FEED</Text>
            <Text style={styles.title}>Yours and your friends&apos; ShinDigs.</Text>
          </View>
          <Pressable onPress={onOpenProfile} style={styles.avatarButton}>
            <Image source={{ uri: profile.avatar }} style={styles.avatar} />
          </Pressable>
        </View>

        {feedShindigs.length > 0 ? (
          <View style={styles.stack}>
            {feedShindigs.map((shindig) => (
              <View key={shindig.id} style={styles.feedCard}>
                <View style={styles.feedCardHeader}>
                  <View style={styles.ownerRow}>
                    <Image source={{ uri: shindig.owner.avatar }} style={styles.ownerAvatar} />
                    <View style={styles.ownerCopy}>
                      <Text style={styles.ownerName}>{shindig.owner.name}</Text>
                      <Text style={styles.ownerHandle}>{shindig.owner.handle}</Text>
                    </View>
                  </View>
                  <Text style={styles.dateText}>
                    {new Date(shindig.createdAt).toLocaleDateString('en-US', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </Text>
                </View>

                <AlbumCard shindig={shindig} />

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryText}>{shindig.photoCount} photos</Text>
                  <Text style={styles.summaryText}>
                    {shindig.stops[0]?.place.title || 'No location'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No feed yet</Text>
            <Text style={styles.emptyText}>
              Add friends and start ShinDigs to build a shared home feed here.
            </Text>
          </View>
        )}
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
    paddingBottom: theme.spacing.xxl,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  kicker: {
    color: theme.colors.accentSoft,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
    marginTop: theme.spacing.sm,
    maxWidth: 260,
  },
  avatarButton: {
    borderColor: theme.colors.border,
    borderRadius: theme.radius.round,
    borderWidth: 2,
    padding: 2,
  },
  avatar: {
    borderRadius: theme.radius.round,
    height: 52,
    width: 52,
  },
  stack: {
    gap: theme.spacing.lg,
    marginTop: theme.spacing.xl,
  },
  feedCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    padding: theme.spacing.md,
  },
  feedCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  ownerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
  },
  ownerAvatar: {
    borderRadius: theme.radius.round,
    height: 40,
    width: 40,
  },
  ownerCopy: {
    marginLeft: theme.spacing.sm,
  },
  ownerName: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  ownerHandle: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  dateText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginLeft: theme.spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
  },
  summaryText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    marginTop: theme.spacing.xl,
    padding: theme.spacing.xl,
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
    marginTop: theme.spacing.sm,
  },
});
