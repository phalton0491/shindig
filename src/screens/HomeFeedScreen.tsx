import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AlbumCard } from '../components/AlbumCard';
import { theme } from '../theme';
import { FeedShindig } from '../types/models';

type HomeFeedScreenProps = {
  feedShindigs: FeedShindig[];
  onOpenFriend: (friendId: string) => void;
  onOpenShindig: (shindig: FeedShindig) => void;
  onStartShindig: () => void;
};

export function HomeFeedScreen({
  feedShindigs,
  onOpenFriend,
  onOpenShindig,
  onStartShindig,
}: HomeFeedScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.kicker}>SHINDIG FEED</Text>
          </View>
          <View style={styles.topSpacer} />
        </View>

        <Pressable onPress={onStartShindig} style={styles.ctaButton}>
          <Text style={styles.ctaButtonText}>Start a Shindig</Text>
        </Pressable>

        {feedShindigs.length > 0 ? (
          <View style={styles.stack}>
            {feedShindigs.map((shindig) => (
              <View key={shindig.id} style={styles.feedCard}>
                <View style={styles.feedCardHeader}>
                  <Pressable
                    onPress={() => onOpenFriend(shindig.owner.id)}
                    style={styles.ownerRow}
                  >
                    <Image source={{ uri: shindig.owner.avatar }} style={styles.ownerAvatar} />
                    <View style={styles.ownerCopy}>
                      <Text style={styles.ownerName}>{shindig.owner.name}</Text>
                      <Text style={styles.ownerHandle}>{shindig.owner.handle}</Text>
                    </View>
                  </Pressable>
                  <Text style={styles.dateText}>
                    {new Date(shindig.createdAt).toLocaleDateString('en-US', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </Text>
                </View>

                <Pressable onPress={() => onOpenShindig(shindig)}>
                  <AlbumCard shindig={shindig} />

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryText}>{shindig.photoCount} photos</Text>
                    <Text style={styles.summaryText}>
                      {shindig.stops[0]?.place.title || 'No location'}
                    </Text>
                  </View>
                </Pressable>
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
  topSpacer: {
    width: 44,
  },
  kicker: {
    color: theme.colors.accentSoft,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  stack: {
    gap: theme.spacing.lg,
    marginTop: theme.spacing.xl,
  },
  ctaButton: {
    alignItems: 'center',
    backgroundColor: '#FF615A',
    borderRadius: theme.radius.round,
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    width: '100%',
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
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
