import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '../components/PageHeader';
import { theme } from '../theme';
import { AppNotification } from '../types/models';

type NotificationsScreenProps = {
  headerActions?: React.ReactNode;
  notifications: AppNotification[];
  onAcceptFriendRequest: (friendId: string) => Promise<void>;
  onAcceptShindigInvite: (inviteId: string) => Promise<void>;
  onMaybeShindigInvite: (inviteId: string) => Promise<void>;
  onOpenNotification: (notification: AppNotification) => void;
  onApprovePhotoRequest: (requestId: string) => Promise<void>;
  onBack: () => void;
  onOpenFriend: (friendId: string) => void;
  onRejectShindigInvite: (inviteId: string) => Promise<void>;
  onRejectPhotoRequest: (requestId: string) => Promise<void>;
  onRejectFriendRequest: (friendId: string) => Promise<void>;
};

export function NotificationsScreen({
  headerActions,
  notifications,
  onAcceptFriendRequest,
  onAcceptShindigInvite,
  onMaybeShindigInvite,
  onOpenNotification,
  onApprovePhotoRequest,
  onBack,
  onOpenFriend,
  onRejectShindigInvite,
  onRejectPhotoRequest,
  onRejectFriendRequest,
}: NotificationsScreenProps) {
  const [actingFriendId, setActingFriendId] = useState('');
  const [actingRequestId, setActingRequestId] = useState('');

  function isUpcomingInvite(notification: AppNotification) {
    return (
      notification.type === 'shindig_invite' &&
      Boolean(notification.inviteId) &&
      notification.shindigState === 'planned' &&
      Boolean(notification.shindigPlannedFor) &&
      new Date(notification.shindigPlannedFor!).getTime() > Date.now()
    );
  }

  function canChangeInviteResponse(notification: AppNotification) {
    return isUpcomingInvite(notification) && notification.inviteStatus === 'pending';
  }

  async function handleAcceptFriendRequest(friendId: string) {
    setActingFriendId(friendId);
    try {
      await onAcceptFriendRequest(friendId);
    } finally {
      setActingFriendId('');
    }
  }

  async function handleRejectFriendRequest(friendId: string) {
    setActingFriendId(friendId);
    try {
      await onRejectFriendRequest(friendId);
    } finally {
      setActingFriendId('');
    }
  }

  async function handleApprovePhotoRequest(requestId: string) {
    setActingRequestId(requestId);
    try {
      await onApprovePhotoRequest(requestId);
    } finally {
      setActingRequestId('');
    }
  }

  async function handleAcceptInvite(inviteId: string) {
    setActingRequestId(inviteId);
    try {
      await onAcceptShindigInvite(inviteId);
    } finally {
      setActingRequestId('');
    }
  }

  async function handleRejectInvite(inviteId: string) {
    setActingRequestId(inviteId);
    try {
      await onRejectShindigInvite(inviteId);
    } finally {
      setActingRequestId('');
    }
  }

  async function handleMaybeInvite(inviteId: string) {
    setActingRequestId(inviteId);
    try {
      await onMaybeShindigInvite(inviteId);
    } finally {
      setActingRequestId('');
    }
  }

  async function handleRejectPhotoRequest(requestId: string) {
    setActingRequestId(requestId);
    try {
      await onRejectPhotoRequest(requestId);
    } finally {
      setActingRequestId('');
    }
  }

  function notificationMessage(notification: AppNotification) {
    if (notification.type === 'friend_accept') {
      return `Accepted friend request from ${notification.actor.name}.`;
    }

    if (notification.type === 'friend_reject') {
      return `Rejected friend request from ${notification.actor.name}.`;
    }

    if (notification.type === 'shindig_invite') {
      if (notification.inviteStatus === 'accepted' && !canChangeInviteResponse(notification)) {
        return `Accepted ShinDig invite from ${notification.actor.name}.`;
      }

      if (notification.inviteStatus === 'rejected' && !canChangeInviteResponse(notification)) {
        return `Rejected ShinDig invite from ${notification.actor.name}.`;
      }

      if (notification.inviteStatus === 'maybe' && !canChangeInviteResponse(notification)) {
        return `Marked ShinDig invite from ${notification.actor.name} as maybe.`;
      }
    }

    return notification.message;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader onBack={onBack} right={headerActions} title="Notifications" />

        <Text style={styles.subtitle}>
          Recent friend activity, likes, and comments across your ShinDigs.
        </Text>

        {notifications.length > 0 ? (
          <View style={styles.list}>
            {notifications.map((notification) => (
              <View key={notification.id} style={styles.row}>
                <Pressable
                  onPress={() => {
                    if (
                      notification.type === 'friend_request' ||
                      notification.type === 'friend_accept' ||
                      notification.type === 'friend_reject'
                    ) {
                      onOpenFriend(notification.actor.id);
                      return;
                    }

                    onOpenNotification(notification);
                  }}
                  style={styles.rowPressable}
                >
                  <Image source={{ uri: notification.actor.avatar }} style={styles.avatar} />
                  <View style={styles.copy}>
                    <Text style={styles.message}>{notificationMessage(notification)}</Text>
                    <Text style={styles.time}>
                      {new Date(notification.createdAt).toLocaleString('en-US', {
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        month: 'short',
                      })}
                    </Text>
                  </View>
                </Pressable>
                {notification.type === 'friend_request' ? (
                  <View style={styles.actionRow}>
                    <Pressable
                      disabled={actingFriendId === notification.actor.id}
                      onPress={() => handleAcceptFriendRequest(notification.actor.id)}
                      style={styles.acceptButton}
                    >
                      <Text style={styles.acceptButtonText}>
                        {actingFriendId === notification.actor.id ? '...' : 'Accept'}
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={actingFriendId === notification.actor.id}
                      onPress={() => handleRejectFriendRequest(notification.actor.id)}
                      style={styles.rejectButton}
                    >
                      <Text style={styles.rejectButtonText}>Reject</Text>
                    </Pressable>
                  </View>
                ) : null}
                {notification.type === 'shindig_invite' && notification.inviteId ? (
                  canChangeInviteResponse(notification) ? (
                    <View style={styles.actionRow}>
                      <Pressable
                        disabled={actingRequestId === notification.inviteId}
                        onPress={() => handleAcceptInvite(notification.inviteId!)}
                        style={[
                          styles.acceptButton,
                          notification.inviteStatus === 'accepted' && styles.selectedResponseButton,
                        ]}
                      >
                        <Text style={styles.acceptButtonText}>
                          {actingRequestId === notification.inviteId ? '...' : 'Accept'}
                        </Text>
                      </Pressable>
                      <Pressable
                        disabled={actingRequestId === notification.inviteId}
                        onPress={() => handleMaybeInvite(notification.inviteId!)}
                        style={[
                          styles.maybeButton,
                          notification.inviteStatus === 'maybe' && styles.selectedResponseButton,
                        ]}
                      >
                        <Text style={styles.maybeButtonText}>Maybe</Text>
                      </Pressable>
                      <Pressable
                        disabled={actingRequestId === notification.inviteId}
                        onPress={() => handleRejectInvite(notification.inviteId!)}
                        style={[
                          styles.rejectButton,
                          notification.inviteStatus === 'rejected' && styles.selectedResponseRejectButton,
                        ]}
                      >
                        <Text style={styles.rejectButtonText}>Reject</Text>
                      </Pressable>
                    </View>
                  ) : notification.inviteStatus === 'accepted' ? (
                    <View style={styles.actionRow}>
                      <View style={styles.resolvedPillApproved}>
                        <Ionicons color="#FFFFFF" name="checkmark" size={16} />
                        <Text style={styles.resolvedPillApprovedText}>Joined ShinDig</Text>
                      </View>
                    </View>
                  ) : notification.inviteStatus === 'rejected' ? (
                    <View style={styles.actionRow}>
                      <View style={styles.resolvedPillRejected}>
                        <Ionicons color={theme.colors.textSecondary} name="close" size={16} />
                        <Text style={styles.resolvedPillRejectedText}>Invite declined</Text>
                      </View>
                    </View>
                  ) : notification.inviteStatus === 'maybe' ? (
                    <View style={styles.actionRow}>
                      <View style={styles.resolvedPillMaybe}>
                        <Ionicons color="#FFFFFF" name="help" size={16} />
                        <Text style={styles.resolvedPillMaybeText}>Maybe</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.actionRow}>
                      <Pressable
                        disabled={actingRequestId === notification.inviteId}
                        onPress={() => handleAcceptInvite(notification.inviteId!)}
                        style={styles.acceptButton}
                      >
                        <Text style={styles.acceptButtonText}>
                          {actingRequestId === notification.inviteId ? '...' : 'Accept'}
                        </Text>
                      </Pressable>
                      <Pressable
                        disabled={actingRequestId === notification.inviteId}
                        onPress={() => handleRejectInvite(notification.inviteId!)}
                        style={styles.rejectButton}
                      >
                        <Text style={styles.rejectButtonText}>Reject</Text>
                      </Pressable>
                    </View>
                  )
                ) : null}
                {notification.type === 'photo_add_request' && notification.requestId ? (
                  <View style={styles.requestPhotoSection}>
                    {notification.requestPhotoUrl ? (
                      <Image
                        resizeMode="contain"
                        source={{ uri: notification.requestPhotoUrl }}
                        style={styles.requestPhotoPreview}
                      />
                    ) : null}
                    {notification.requestStatus === 'approved' ? (
                      <View style={styles.resolvedPillApproved}>
                        <Ionicons color="#FFFFFF" name="checkmark" size={16} />
                        <Text style={styles.resolvedPillApprovedText}>Added to ShinDig</Text>
                      </View>
                    ) : notification.requestStatus === 'rejected' ? (
                      <View style={styles.resolvedPillRejected}>
                        <Ionicons
                          color={theme.colors.textSecondary}
                          name="close"
                          size={16}
                        />
                        <Text style={styles.resolvedPillRejectedText}>Cancelled</Text>
                      </View>
                    ) : (
                      <View style={styles.actionRow}>
                        <Pressable
                          disabled={actingRequestId === notification.requestId}
                          onPress={() => handleApprovePhotoRequest(notification.requestId!)}
                          style={styles.acceptButton}
                        >
                          <Text style={styles.acceptButtonText}>
                            {actingRequestId === notification.requestId ? '...' : 'Add to ShinDig'}
                          </Text>
                        </Pressable>
                        <Pressable
                          disabled={actingRequestId === notification.requestId}
                          onPress={() => handleRejectPhotoRequest(notification.requestId!)}
                          style={styles.rejectButton}
                        >
                          <Text style={styles.rejectButtonText}>Reject</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptyText}>
              Friend requests, likes, and comments will show up here.
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
    paddingBottom: theme.spacing.xxxl,
    paddingTop: 16,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 44,
    justifyContent: 'flex-start',
  },
  backButton: {
    alignItems: 'center',
    height: 52,
    justifyContent: 'center',
    marginLeft: -14,
    width: 52,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 30,
    fontWeight: '800',
    marginTop: theme.spacing.md,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    marginTop: theme.spacing.sm,
  },
  list: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xl,
  },
  row: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    padding: theme.spacing.md,
  },
  rowPressable: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  avatar: {
    borderRadius: theme.radius.round,
    height: 48,
    width: 48,
  },
  copy: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  message: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 21,
  },
  time: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    paddingLeft: 60,
  },
  requestPhotoSection: {
    marginTop: theme.spacing.md,
    paddingLeft: 60,
  },
  requestPhotoPreview: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.lg,
    height: 180,
    marginBottom: theme.spacing.md,
    width: '100%',
  },
  resolvedPillApproved: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#2E8B57',
    borderRadius: theme.radius.round,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  resolvedPillApprovedText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  resolvedPillRejected: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.round,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  resolvedPillRejectedText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  resolvedPillMaybe: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accentPurple,
    borderRadius: theme.radius.round,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  resolvedPillMaybeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  acceptButton: {
    backgroundColor: theme.colors.accentPink,
    borderRadius: theme.radius.round,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  maybeButton: {
    backgroundColor: theme.colors.accentPurple,
    borderRadius: theme.radius.round,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  maybeButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  selectedResponseButton: {
    borderColor: '#FFFFFF',
    borderWidth: 1,
  },
  selectedResponseRejectButton: {
    borderColor: theme.colors.accentPink,
    borderWidth: 1,
  },
  rejectButton: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.round,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  rejectButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
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
