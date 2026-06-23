import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AlbumCard } from '../components/AlbumCard';
import { PageHeader } from '../components/PageHeader';
import { theme } from '../theme';
import { FeedShindig } from '../types/models';

type HomeFeedScreenProps = {
  feedShindigs: FeedShindig[];
  headerActions?: React.ReactNode;
  onOpenFriend: (friendId: string) => void;
  onOpenShindig: (shindig: FeedShindig) => void;
  onRefresh: () => Promise<void>;
  scrollToTopSignal?: number;
};

export function HomeFeedScreen({
  feedShindigs,
  headerActions,
  onOpenFriend,
  onOpenShindig,
  onRefresh,
  scrollToTopSignal = 0,
}: HomeFeedScreenProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  function badgeLabel(state: FeedShindig['state']) {
    return state === 'active' ? 'Active' : 'Completed';
  }

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({
      animated: true,
      y: 0,
    });
  }, [scrollToTopSignal]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        ref={scrollRef}
        refreshControl={
          <RefreshControl
            onRefresh={() => void handleRefresh()}
            refreshing={isRefreshing}
            tintColor={theme.colors.accentSoft}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <PageHeader right={headerActions} title="Feed" />
        {isRefreshing ? <Text style={styles.refreshText}>Updating feed...</Text> : null}

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
                  <View style={styles.headerMeta}>
                    <View
                      style={[
                        styles.stateBadge,
                        shindig.state === 'active' ? styles.stateBadgeActive : styles.stateBadgeCompleted,
                      ]}
                    >
                      <Text
                        style={[
                          styles.stateBadgeText,
                          shindig.state === 'active'
                            ? styles.stateBadgeTextActive
                            : styles.stateBadgeTextCompleted,
                        ]}
                      >
                        {badgeLabel(shindig.state)}
                      </Text>
                    </View>
                    <Text style={styles.dateText}>
                      {new Date(shindig.createdAt).toLocaleDateString('en-US', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </Text>
                  </View>
                </View>

                <Pressable onPress={() => onOpenShindig(shindig)}>
                  <AlbumCard shindig={shindig} />

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryCountText}>{shindig.photoCount} photos</Text>
                    <Text numberOfLines={1} style={styles.summaryLocationText}>
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
    paddingTop: 28,
  },
  stack: {
    gap: theme.spacing.lg,
    marginTop: theme.spacing.xl,
  },
  refreshText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: theme.spacing.lg,
    textAlign: 'center',
  },
  feedCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
    borderRadius: 26,
    borderWidth: 1,
    padding: theme.spacing.md,
    shadowColor: '#000000',
    shadowOffset: {
      height: 10,
      width: 0,
    },
    shadowOpacity: 0.24,
    shadowRadius: 20,
  },
  feedCardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  headerMeta: {
    alignItems: 'flex-end',
    marginLeft: theme.spacing.sm,
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
    fontSize: 16,
    fontWeight: '800',
  },
  ownerHandle: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  dateText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: theme.spacing.xs,
  },
  stateBadge: {
    borderRadius: theme.radius.round,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  stateBadgeActive: {
    backgroundColor: 'rgba(99, 216, 154, 0.16)',
  },
  stateBadgeCompleted: {
    backgroundColor: 'rgba(132, 144, 176, 0.18)',
  },
  stateBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  stateBadgeTextActive: {
    color: '#63D89A',
  },
  stateBadgeTextCompleted: {
    color: theme.colors.textMuted,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  summaryText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  summaryCountText: {
    color: theme.colors.textSecondary,
    flexShrink: 0,
    fontSize: 13,
  },
  summaryLocationText: {
    color: theme.colors.textSecondary,
    flex: 1,
    fontSize: 13,
    minWidth: 0,
    textAlign: 'right',
  },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
    borderRadius: 26,
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
