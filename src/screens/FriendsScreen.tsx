import { useDeferredValue, useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PageHeader } from '../components/PageHeader';
import {
  acceptFriendRequest,
  listFriendRequestsForUser,
  sendFriendRequest,
} from '../lib/friends';
import { createNotification } from '../lib/notifications';
import { searchProfilesByUsername } from '../lib/profiles';
import { theme } from '../theme';
import { FriendProfile, FriendRequest, UserProfile } from '../types/models';

type FriendsScreenProps = {
  friends: FriendProfile[];
  headerActions?: React.ReactNode;
  onFriendsChanged: () => Promise<void>;
  onOpenFriend: (friendId: string) => void;
  onOpenProfile: () => void;
  profile: UserProfile;
  userId: string;
};

export function FriendsScreen({
  friends,
  headerActions,
  onFriendsChanged,
  onOpenFriend,
  onOpenProfile,
  profile,
  userId,
}: FriendsScreenProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendProfile[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [actingFriendId, setActingFriendId] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [activeSearchQuery, setActiveSearchQuery] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadRequests() {
      try {
        const nextRequests = await listFriendRequestsForUser(userId);
        if (isMounted) {
          setRequests(nextRequests);
        }
      } catch (nextError) {
        if (isMounted) {
          setError(
            nextError instanceof Error ? nextError.message : 'Failed to load friend requests.'
          );
        }
      }
    }

    loadRequests();

    return () => {
      isMounted = false;
    };
  }, [friends, userId]);

  useEffect(() => {
    let isMounted = true;

    async function runSearch() {
      const normalizedQuery = deferredQuery.trim();
      if (normalizedQuery.length < 2) {
        setResults([]);
        setHasSearched(false);
        setActiveSearchQuery('');
        setIsSearching(false);
        return;
      }

      setActiveSearchQuery(normalizedQuery);
      setIsSearching(true);
      try {
        const excludedIds = [
          ...friends.map((friend) => friend.id),
          ...requests.map((request) => request.profile.id),
        ];
        const nextResults = await searchProfilesByUsername({
          currentUserId: userId,
          excludedUserIds: excludedIds,
          query: normalizedQuery,
        });

        if (isMounted) {
          setResults(nextResults);
          setHasSearched(true);
        }
      } catch (nextError) {
        if (isMounted) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to search users.');
          setHasSearched(true);
        }
      } finally {
        if (isMounted) {
          setIsSearching(false);
        }
      }
    }

    runSearch();

    return () => {
      isMounted = false;
    };
  }, [deferredQuery, friends, requests, userId]);

  async function refreshRequests() {
    const nextRequests = await listFriendRequestsForUser(userId);
    setRequests(nextRequests);
  }

  async function handleSendRequest(friend: FriendProfile) {
    setActingFriendId(friend.id);
    setError('');

    try {
      const result = await sendFriendRequest({ friendId: friend.id, userId });

      if (result.status === 'pending') {
        await createNotification({
          actorUserId: userId,
          message: `${profile.name} sent you a friend request.`,
          recipientUserId: friend.id,
          type: 'friend_request',
        });
        await refreshRequests();
      } else {
        await createNotification({
          actorUserId: userId,
          message: `${profile.name} accepted your friend request.`,
          recipientUserId: friend.id,
          type: 'friend_accept',
        });
        await Promise.all([refreshRequests(), onFriendsChanged()]);
      }

      setResults((current) => current.filter((result) => result.id !== friend.id));
      setQuery('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to send request.');
    } finally {
      setActingFriendId('');
    }
  }

  async function handleAcceptRequest(friendId: string) {
    setActingFriendId(friendId);
    setError('');

    try {
      await acceptFriendRequest({ friendId, userId });
      const acceptedFriend = requests.find((request) => request.profile.id === friendId)?.profile;
      if (acceptedFriend) {
        await createNotification({
          actorUserId: userId,
          message: `${profile.name} accepted your friend request.`,
          recipientUserId: acceptedFriend.id,
          type: 'friend_accept',
        });
      }
      await refreshRequests();
      await onFriendsChanged();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to accept request.');
    } finally {
      setActingFriendId('');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader
          right={headerActions}
          title="Friends"
        />

        <View style={styles.searchCard}>
          <Text style={styles.cardTitle}>Find friends by username</Text>
          <TextInput
            autoCapitalize="none"
            onChangeText={(value) => {
              setQuery(value);
              setError('');
              if (value.trim().length < 2) {
                setHasSearched(false);
              }
            }}
            placeholder="Search usernames"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={query}
          />
          {isSearching ? <Text style={styles.helperText}>Searching users...</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.resultsList}>
            {results.map((result) => (
              <View key={result.id} style={styles.resultRow}>
                <View style={styles.resultCopy}>
                  <Image source={{ uri: result.avatar }} style={styles.resultAvatar} />
                  <View style={styles.resultText}>
                    <Text style={styles.resultName}>{result.name}</Text>
                    <Text style={styles.resultMeta}>
                      {result.handle} · {result.city}
                    </Text>
                  </View>
                </View>
                <Pressable
                  disabled={actingFriendId === result.id}
                  onPress={() => handleSendRequest(result)}
                  style={styles.addButton}
                >
                  <Text style={styles.addButtonText}>
                    {actingFriendId === result.id ? 'Sending...' : 'Request'}
                  </Text>
                </Pressable>
              </View>
            ))}
            {!isSearching &&
            hasSearched &&
            activeSearchQuery === deferredQuery.trim() &&
            deferredQuery.trim().length >= 2 &&
            results.length === 0 ? (
              <Text style={styles.helperText}>No usernames matched that search.</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Requests</Text>
          <Text style={styles.sectionCount}>{requests.length}</Text>
        </View>

        {requests.length > 0 ? (
          <View style={styles.friendList}>
            {requests.map((request) => (
              <View
                key={`${request.profile.id}-${request.direction}`}
                style={styles.friendCard}
              >
                <Image source={{ uri: request.profile.avatar }} style={styles.friendAvatar} />
                <View style={styles.friendText}>
                  <Text style={styles.friendName}>{request.profile.name}</Text>
                  <Text style={styles.friendMeta}>
                    {request.profile.handle} ·{' '}
                    {request.direction === 'incoming' ? 'Requested you' : 'Request sent'}
                  </Text>
                </View>
                {request.direction === 'incoming' ? (
                  <Pressable
                    disabled={actingFriendId === request.profile.id}
                    onPress={() => handleAcceptRequest(request.profile.id)}
                    style={styles.addButton}
                  >
                    <Text style={styles.addButtonText}>
                      {actingFriendId === request.profile.id ? 'Saving...' : 'Accept'}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={styles.pendingPill}>
                    <Text style={styles.pendingPillText}>Pending</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No pending friend requests.</Text>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your friends</Text>
          <Text style={styles.sectionCount}>{friends.length}</Text>
        </View>

        {friends.length > 0 ? (
          <View style={styles.friendList}>
            {friends.map((friend) => (
              <Pressable
                key={friend.id}
                onPress={() => onOpenFriend(friend.id)}
                style={styles.friendCard}
              >
                <Image source={{ uri: friend.avatar }} style={styles.friendAvatar} />
                <View style={styles.friendText}>
                  <Text style={styles.friendName}>{friend.name}</Text>
                  <Text style={styles.friendMeta}>
                    {friend.handle} · {friend.city}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>
            Confirm friends to see their ShinDigs show up on the home feed.
          </Text>
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
  title: {
    color: theme.colors.accentPink,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -1,
  },
  searchCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
    borderRadius: 26,
    borderWidth: 1,
    marginTop: theme.spacing.xl,
    padding: theme.spacing.lg,
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: theme.spacing.md,
  },
  input: {
    backgroundColor: theme.colors.backgroundAlt,
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  helperText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: theme.spacing.sm,
  },
  errorText: {
    color: '#FF9F8A',
    fontSize: 13,
    marginTop: theme.spacing.sm,
  },
  resultsList: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  resultRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 35, 62, 0.88)',
    borderColor: theme.colors.border,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
  },
  resultCopy: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
  },
  resultAvatar: {
    borderRadius: theme.radius.round,
    height: 44,
    width: 44,
  },
  resultText: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  resultName: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  resultMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  addButton: {
    backgroundColor: theme.colors.accentPink,
    borderRadius: theme.radius.round,
    marginLeft: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xl,
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  sectionCount: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  friendList: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  friendCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    padding: theme.spacing.md,
  },
  friendAvatar: {
    borderRadius: theme.radius.round,
    height: 52,
    width: 52,
  },
  friendText: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  friendName: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  friendMeta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  pendingPill: {
    backgroundColor: 'rgba(23, 35, 62, 0.92)',
    borderColor: theme.colors.border,
    borderRadius: theme.radius.round,
    borderWidth: 1,
    marginLeft: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  pendingPillText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: theme.spacing.md,
  },
});
