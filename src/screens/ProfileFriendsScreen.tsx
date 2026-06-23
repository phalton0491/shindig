import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '../components/PageHeader';
import { sendFriendRequest } from '../lib/friends';
import { createNotification } from '../lib/notifications';
import { theme } from '../theme';
import { FriendProfile, UserProfile } from '../types/models';

type ProfileFriendsScreenProps = {
  currentFriends: FriendProfile[];
  currentUserId: string;
  currentUserProfile: UserProfile;
  friends: FriendProfile[];
  headerActions?: React.ReactNode;
  onBack: () => void;
  onOpenFriend: (friendId: string) => void;
  onRefreshCurrentFriends: () => Promise<void>;
  ownerName: string;
  showAddButtons: boolean;
};

export function ProfileFriendsScreen({
  currentFriends,
  currentUserId,
  currentUserProfile,
  friends,
  headerActions,
  onBack,
  onOpenFriend,
  onRefreshCurrentFriends,
  ownerName,
  showAddButtons,
}: ProfileFriendsScreenProps) {
  const [actingFriendId, setActingFriendId] = useState('');
  const [requestedFriendIds, setRequestedFriendIds] = useState<string[]>([]);

  async function handleAddFriend(friend: FriendProfile) {
    setActingFriendId(friend.id);

    try {
      const result = await sendFriendRequest({
        friendId: friend.id,
        userId: currentUserId,
      });

      if (result.status === 'pending') {
        await createNotification({
          actorUserId: currentUserId,
          message: `${currentUserProfile.name} sent you a friend request.`,
          recipientUserId: friend.id,
          type: 'friend_request',
        });
        setRequestedFriendIds((current) =>
          current.includes(friend.id) ? current : [...current, friend.id]
        );
      } else {
        await createNotification({
          actorUserId: currentUserId,
          message: `${currentUserProfile.name} accepted your friend request.`,
          recipientUserId: friend.id,
          type: 'friend_accept',
        });
        await onRefreshCurrentFriends();
      }
    } finally {
      setActingFriendId('');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader onBack={onBack} right={headerActions} />

        <Text style={styles.title}>{ownerName}'s Friends</Text>
        <Text style={styles.subtitle}>{friends.length} total</Text>

        {friends.length > 0 ? (
          <View style={styles.list}>
            {friends.map((friend) => {
              const alreadyFriend = currentFriends.some((current) => current.id === friend.id);
              const requested = requestedFriendIds.includes(friend.id);
              const canAdd =
                showAddButtons && friend.id !== currentUserId && !alreadyFriend && !requested;

              return (
                <View key={friend.id} style={styles.row}>
                  <Pressable onPress={() => onOpenFriend(friend.id)} style={styles.friendPressable}>
                    <Image source={{ uri: friend.avatar }} style={styles.avatar} />
                    <View style={styles.copy}>
                      <Text style={styles.name}>{friend.name}</Text>
                      <Text style={styles.meta}>
                        {friend.handle} | {friend.city}
                      </Text>
                    </View>
                  </Pressable>

                  {canAdd ? (
                    <Pressable
                      disabled={actingFriendId === friend.id}
                      onPress={() => void handleAddFriend(friend)}
                      style={styles.addButton}
                    >
                      <Text style={styles.addButtonText}>
                        {actingFriendId === friend.id ? 'Adding...' : 'Add Friend'}
                      </Text>
                    </Pressable>
                  ) : requested ? (
                    <View style={styles.pendingPill}>
                      <Text style={styles.pendingPillText}>Pending</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.emptyText}>No friends to show yet.</Text>
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
    paddingBottom: theme.spacing.xxxl,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 28,
  },
  title: {
    color: theme.colors.accentPink,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -1,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginTop: theme.spacing.xs,
  },
  list: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.xl,
  },
  row: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    padding: theme.spacing.md,
  },
  friendPressable: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
  },
  avatar: {
    borderRadius: theme.radius.round,
    height: 52,
    width: 52,
  },
  copy: {
    marginLeft: theme.spacing.md,
  },
  name: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 3,
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
    fontWeight: '700',
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
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: theme.spacing.xl,
  },
});
