import Ionicons from '@expo/vector-icons/Ionicons';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

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
  const [showRequests, setShowRequests] = useState(false);
  const [showFriends, setShowFriends] = useState(true);
  const deferredQuery = useDeferredValue(query);
  const [activeSearchQuery, setActiveSearchQuery] = useState('');

  const displayName = useMemo(() => {
    const trimmed = profile.name.trim();
    return trimmed.length > 0 ? trimmed.split(/\s+/)[0] : 'there';
  }, [profile.name]);

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

  async function handleInviteFriends() {
    try {
      await Share.share({
        message: 'Join me on ShinDig so we can plan the next shindig together.',
        title: 'Invite friends to ShinDig',
      });
    } catch {
      onOpenProfile();
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Friends {'\uD83D\uDC4B'}</Text>
            <Text style={styles.headerSubtitle}>Connect with friends on Shindig.</Text>
          </View>
          <View style={styles.headerActions}>{headerActions}</View>
        </View>

        <View style={styles.panelCard}>
          <View style={styles.panelHeader}>
            <View style={[styles.panelIconWrap, styles.findPanelIcon]}>
              <Ionicons color="#FFFFFF" name="people" size={28} />
            </View>
            <View style={styles.panelHeaderCopy}>
              <Text style={styles.panelTitle}>Find friends</Text>
              <Text style={styles.panelSubtitle}>Search by username to add friends.</Text>
            </View>
          </View>

          <View style={styles.searchField}>
            <Ionicons color={theme.colors.accentPink} name="search" size={28} />
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
              style={styles.searchInput}
              value={query}
            />
          </View>

          {isSearching ? <Text style={styles.helperText}>Searching users...</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {results.length > 0 ? (
            <View style={styles.searchResults}>
              {results.map((result) => (
                <View key={result.id} style={styles.searchResultRow}>
                  <View style={styles.personRowMain}>
                    <Image source={{ uri: result.avatar }} style={styles.personAvatar} />
                    <View style={styles.personCopy}>
                      <Text style={styles.personName}>{result.name}</Text>
                      <Text style={styles.personHandle}>{result.handle}</Text>
                    </View>
                  </View>
                  <Pressable
                    disabled={actingFriendId === result.id}
                    onPress={() => handleSendRequest(result)}
                    style={styles.circleAction}
                  >
                    <Ionicons
                      color="#FFFFFF"
                      name={actingFriendId === result.id ? 'time-outline' : 'add'}
                      size={20}
                    />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {!isSearching &&
          hasSearched &&
          activeSearchQuery === deferredQuery.trim() &&
          deferredQuery.trim().length >= 2 &&
          results.length === 0 ? (
            <Text style={styles.helperText}>No usernames matched that search.</Text>
          ) : null}
        </View>

        <Pressable onPress={() => setShowRequests((current) => !current)} style={styles.summaryCard}>
          <View style={styles.summaryCopy}>
            <View style={[styles.panelIconWrap, styles.requestsPanelIcon]}>
              <Ionicons color="#9D7CFF" name="person-add" size={24} />
            </View>
            <View style={styles.summaryText}>
              <Text style={styles.summaryTitle}>Friend requests</Text>
              <Text style={styles.summarySubtitle}>
                {requests.length > 0 ? `${requests.length} pending request${requests.length === 1 ? '' : 's'}` : 'No pending requests'}
              </Text>
            </View>
          </View>
          <View style={styles.summaryRight}>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{requests.length}</Text>
            </View>
            <Ionicons
              color={theme.colors.textSecondary}
              name={showRequests ? 'chevron-up' : 'chevron-forward'}
              size={22}
            />
          </View>
        </Pressable>

        {showRequests && requests.length > 0 ? (
          <View style={styles.detailCard}>
            {requests.map((request, index) => (
              <View
                key={`${request.profile.id}-${request.direction}`}
                style={[styles.detailRow, index < requests.length - 1 ? styles.detailRowBorder : null]}
              >
                <View style={styles.personRowMain}>
                  <Image source={{ uri: request.profile.avatar }} style={styles.personAvatar} />
                  <View style={styles.personCopy}>
                    <Text style={styles.personName}>{request.profile.name}</Text>
                    <Text style={styles.personMeta}>
                      {request.profile.handle} {'\u2022'}{' '}
                      {request.direction === 'incoming' ? 'Requested you' : 'Request sent'}
                    </Text>
                  </View>
                </View>
                {request.direction === 'incoming' ? (
                  <Pressable
                    disabled={actingFriendId === request.profile.id}
                    onPress={() => handleAcceptRequest(request.profile.id)}
                    style={styles.acceptButton}
                  >
                    <Text style={styles.acceptButtonText}>
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
        ) : null}

        <View style={[styles.summaryCard, styles.summaryCardStack]}>
          <Pressable onPress={() => setShowFriends((current) => !current)} style={styles.friendsCardHeader}>
            <View style={styles.summaryCopy}>
              <View style={[styles.panelIconWrap, styles.friendsPanelIcon]}>
                <Ionicons color={theme.colors.accentPink} name="person-outline" size={24} />
              </View>
              <View style={styles.summaryText}>
                <Text style={styles.summaryTitle}>Your friends</Text>
              </View>
            </View>
            <View style={styles.summaryRight}>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{friends.length}</Text>
              </View>
              <Ionicons
                color={theme.colors.textSecondary}
                name={showFriends ? 'chevron-down' : 'chevron-forward'}
                size={22}
              />
            </View>
          </Pressable>

          {showFriends ? (
            friends.length > 0 ? (
              <View style={styles.friendsList}>
                {friends.map((friend, index) => (
                  <Pressable
                    key={friend.id}
                    onPress={() => onOpenFriend(friend.id)}
                    style={[styles.friendCard, index < friends.length - 1 ? styles.friendCardSpacing : null]}
                  >
                    <View style={styles.personRowMain}>
                      <View style={styles.friendAvatarWrap}>
                        <Image source={{ uri: friend.avatar }} style={styles.friendAvatar} />
                        <View style={styles.onlineDot} />
                      </View>
                      <View style={styles.personCopy}>
                        <Text style={styles.friendName}>{friend.name}</Text>
                        <Text style={styles.personHandle}>{friend.handle}</Text>
                        <View style={styles.friendMetaRow}>
                          <Ionicons color={theme.colors.accentPink} name="location-outline" size={15} />
                          <Text style={styles.friendMetaText}>{friend.city}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.friendMenuButton}>
                      <Ionicons color={theme.colors.accentPink} name="ellipsis-horizontal" size={20} />
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>
                Confirm friends to see their ShinDigs show up on the home feed.
              </Text>
            )
          ) : null}
        </View>

        <View style={styles.inviteCard}>
          <View style={styles.inviteCopy}>
            <Text style={styles.summaryTitle}>Invite friends</Text>
            <Text style={styles.inviteSubtitle}>
              Share your Shindig and invite friends to join the fun!
            </Text>
          </View>
          <Pressable onPress={handleInviteFriends} style={styles.inviteButton}>
            <Ionicons color={theme.colors.accentPink} name="share-social-outline" size={20} />
            <Text style={styles.inviteButtonText}>Invite</Text>
          </Pressable>
        </View>

        <View style={styles.footerSpace} />
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
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 28,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
    paddingRight: theme.spacing.md,
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  headerSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 17,
    marginTop: theme.spacing.xs,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  panelCard: {
    backgroundColor: 'rgba(16, 24, 46, 0.92)',
    borderColor: theme.colors.borderStrong,
    borderRadius: 30,
    borderWidth: 1,
    marginTop: 30,
    padding: theme.spacing.lg,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  panelIconWrap: {
    alignItems: 'center',
    borderRadius: 26,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  findPanelIcon: {
    backgroundColor: 'rgba(255, 79, 160, 0.92)',
  },
  requestsPanelIcon: {
    backgroundColor: 'rgba(122, 99, 255, 0.22)',
  },
  friendsPanelIcon: {
    backgroundColor: 'rgba(255, 79, 160, 0.1)',
  },
  panelHeaderCopy: {
    flex: 1,
  },
  panelTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  panelSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 2,
  },
  searchField: {
    alignItems: 'center',
    backgroundColor: 'rgba(8, 15, 31, 0.82)',
    borderColor: theme.colors.border,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
    minHeight: 88,
    paddingHorizontal: theme.spacing.lg,
  },
  searchInput: {
    color: theme.colors.textPrimary,
    flex: 1,
    fontSize: 18,
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
  searchResults: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  searchResultRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(22, 33, 61, 0.92)',
    borderColor: theme.colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 14,
  },
  personRowMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
  },
  personAvatar: {
    borderRadius: theme.radius.round,
    height: 54,
    width: 54,
  },
  personCopy: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  personName: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  personHandle: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  personMeta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  circleAction: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentPink,
    borderRadius: theme.radius.round,
    height: 42,
    justifyContent: 'center',
    marginLeft: theme.spacing.sm,
    width: 42,
  },
  summaryCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(16, 24, 46, 0.92)',
    borderColor: theme.colors.border,
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 22,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  summaryCardStack: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  summaryCopy: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  summaryText: {
    flex: 1,
  },
  summaryTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  summarySubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 4,
  },
  summaryRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginLeft: theme.spacing.sm,
  },
  countBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(29, 39, 70, 0.96)',
    borderRadius: theme.radius.round,
    height: 44,
    justifyContent: 'center',
    minWidth: 44,
    paddingHorizontal: theme.spacing.sm,
  },
  countBadgeText: {
    color: theme.colors.textSecondary,
    fontSize: 17,
    fontWeight: '800',
  },
  detailCard: {
    backgroundColor: 'rgba(16, 24, 46, 0.84)',
    borderColor: theme.colors.border,
    borderRadius: 26,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: theme.spacing.lg,
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
  },
  detailRowBorder: {
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
  },
  acceptButton: {
    backgroundColor: theme.colors.accentPink,
    borderRadius: theme.radius.round,
    marginLeft: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
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
  friendsCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  friendsList: {
    marginTop: theme.spacing.lg,
    width: '100%',
  },
  friendCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 35, 62, 0.7)',
    borderColor: theme.colors.border,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
  },
  friendCardSpacing: {
    marginBottom: theme.spacing.md,
  },
  friendAvatarWrap: {
    position: 'relative',
  },
  friendAvatar: {
    borderRadius: theme.radius.round,
    height: 84,
    width: 84,
  },
  onlineDot: {
    backgroundColor: '#25E17B',
    borderColor: theme.colors.surface,
    borderRadius: theme.radius.round,
    borderWidth: 2,
    bottom: 6,
    height: 20,
    position: 'absolute',
    right: 2,
    width: 20,
  },
  friendName: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  friendMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  friendMetaText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  friendMenuButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(26, 37, 67, 0.95)',
    borderColor: theme.colors.border,
    borderRadius: theme.radius.round,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    marginLeft: theme.spacing.md,
    width: 64,
  },
  inviteCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(16, 24, 46, 0.92)',
    borderColor: theme.colors.border,
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 22,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  inviteCopy: {
    flex: 1,
    paddingRight: theme.spacing.md,
  },
  inviteSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 28,
    marginTop: 4,
  },
  inviteButton: {
    alignItems: 'center',
    borderColor: theme.colors.accentPink,
    borderRadius: theme.radius.round,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginLeft: theme.spacing.md,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  inviteButtonText: {
    color: theme.colors.accentPink,
    fontSize: 17,
    fontWeight: '800',
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: theme.spacing.lg,
    width: '100%',
  },
  footerSpace: {
    height: 120,
  },
});
