import { useEffect, useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PageHeader } from '../components/PageHeader';
import { listShindigChatMessages, listShindigChatPreviews, sendShindigChatMessage } from '../lib/chats';
import { createNotification, markChatNotificationsRead } from '../lib/notifications';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';
import { AppNotification, SavedShindig, ShindigChatMessage, ShindigChatPreview } from '../types/models';

type ShindigChatsScreenProps = {
  headerActions?: React.ReactNode;
  initialShindigId?: string | null;
  notifications: AppNotification[];
  onBack: () => void;
  shindigs: SavedShindig[];
  userId: string;
};

function formatChatTimestamp(value: string) {
  return new Date(value).toLocaleString('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  });
}

function formatChatPreviewTime(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  });
}

export function ShindigChatsScreen({
  headerActions,
  initialShindigId = null,
  notifications,
  onBack,
  shindigs,
  userId,
}: ShindigChatsScreenProps) {
  const [activeShindigId, setActiveShindigId] = useState('');
  const [chatPreviews, setChatPreviews] = useState<ShindigChatPreview[]>([]);
  const [messages, setMessages] = useState<ShindigChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);

  const chatEligibleShindigs = useMemo(
    () =>
      shindigs
        .filter((shindig) => shindig.ownerId === userId || shindig.inviteStatus === 'accepted')
        .sort((left, right) => {
          const leftTime = new Date(left.plannedFor || left.createdAt).getTime();
          const rightTime = new Date(right.plannedFor || right.createdAt).getTime();
          return rightTime - leftTime;
        }),
    [shindigs, userId]
  );

  const activeShindig =
    chatEligibleShindigs.find((shindig) => shindig.id === activeShindigId) || null;
  const chatEligibleIdsKey = chatEligibleShindigs.map((shindig) => shindig.id).join(',');

  useEffect(() => {
    if (!initialShindigId) {
      return;
    }

    setActiveShindigId(initialShindigId);
  }, [initialShindigId]);
  const unreadChatNotificationCountByShindigId = useMemo(() => {
    const counts = new Map<string, number>();
    notifications
      .filter(
        (notification) =>
          notification.type === 'shindig_chat_message' &&
          !notification.readAt &&
          notification.shindigId
      )
      .forEach((notification) => {
        const shindigId = notification.shindigId!;
        counts.set(shindigId, (counts.get(shindigId) || 0) + 1);
      });
    return counts;
  }, [notifications]);

  async function refreshPreviews() {
    const nextPreviews = await listShindigChatPreviews({
      shindigIds: chatEligibleShindigs.map((shindig) => shindig.id),
      userId,
    });
    setChatPreviews(nextPreviews);
  }

  async function refreshMessages(shindigId: string) {
    const nextMessages = await listShindigChatMessages({
      shindigId,
      userId,
    });
    setMessages(nextMessages);
  }

  useEffect(() => {
    setError('');
    void refreshPreviews().catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load chats.');
    });
  }, [chatEligibleIdsKey, userId]);

  useEffect(() => {
    if (!activeShindig) {
      setMessages([]);
      setDraft('');
      return;
    }

    setError('');
    void markChatNotificationsRead({
      shindigId: activeShindig.id,
      userId,
    }).catch(() => undefined);
    void refreshMessages(activeShindig.id).catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load this chat.');
    });
  }, [activeShindig?.id, userId]);

  useEffect(() => {
    if (!supabase || chatEligibleShindigs.length === 0) {
      return;
    }

    const client = supabase;
    const channel = client
      .channel(`shindig-chats-list:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shindig_chat_messages',
        },
        () => {
          void refreshPreviews();
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [chatEligibleIdsKey, userId]);

  useEffect(() => {
    if (!supabase || !activeShindig) {
      return;
    }

    const client = supabase;
    const channel = client
      .channel(`shindig-chat-thread:${activeShindig.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          filter: `shindig_id=eq.${activeShindig.id}`,
          schema: 'public',
          table: 'shindig_chat_messages',
        },
        () => {
          void refreshMessages(activeShindig.id);
          void refreshPreviews();
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [activeShindig?.id]);

  async function handleSend() {
    if (!activeShindig || !draft.trim()) {
      return;
    }

    setIsSending(true);
    setError('');

    try {
      await sendShindigChatMessage({
        body: draft,
        shindigId: activeShindig.id,
        userId,
      });
      const recipientIds = Array.from(
        new Set([
          activeShindig.ownerId,
          ...activeShindig.inviteParticipants
            .filter((participant) => participant.status === 'accepted')
            .map((participant) => participant.profile.id),
        ])
      ).filter((recipientUserId) => recipientUserId !== userId);

      if (recipientIds.length > 0) {
        await Promise.all(
          recipientIds.map((recipientUserId) =>
            createNotification({
              actorUserId: userId,
              message: `New chat message in "${activeShindig.title}".`,
              recipientUserId,
              shindigId: activeShindig.id,
              type: 'shindig_chat_message',
            })
          )
        );
      }
      setDraft('');
      await Promise.all([refreshMessages(activeShindig.id), refreshPreviews()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to send that message.');
    } finally {
      setIsSending(false);
    }
  }

  const chatPreviewsByShindigId = new Map(chatPreviews.map((preview) => [preview.shindigId, preview]));

  if (activeShindig) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <View style={styles.content}>
            <PageHeader
              onBack={() => setActiveShindigId('')}
              right={headerActions}
              title={activeShindig.title}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <ScrollView contentContainerStyle={styles.threadList} showsVerticalScrollIndicator={false}>
              {messages.length > 0 ? (
                messages.map((message) => {
                  const isMine = message.author.id === userId;
                  return (
                    <View
                      key={message.id}
                      style={[styles.messageRow, isMine && styles.messageRowMine]}
                    >
                      {!isMine ? (
                        <Image source={{ uri: message.author.avatar }} style={styles.messageAvatar} />
                      ) : null}
                      <View style={[styles.messageBubble, isMine && styles.messageBubbleMine]}>
                        {!isMine ? (
                          <Text style={styles.messageAuthor}>{message.author.name}</Text>
                        ) : null}
                        <Text style={[styles.messageBody, isMine && styles.messageBodyMine]}>
                          {message.body}
                        </Text>
                        <Text style={[styles.messageTime, isMine && styles.messageTimeMine]}>
                          {formatChatTimestamp(message.createdAt)}
                        </Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No messages yet</Text>
                  <Text style={styles.emptyText}>
                    Accepted guests for this ShinDig will chat here.
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.composer}>
              <TextInput
                onChangeText={setDraft}
                placeholder="Message this ShinDig group"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={draft}
              />
              <Pressable
                disabled={isSending || !draft.trim()}
                onPress={() => void handleSend()}
                style={[styles.sendButton, (!draft.trim() || isSending) && styles.sendButtonDisabled]}
              >
                <Ionicons color="#FFFFFF" name="send" size={16} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <PageHeader onBack={onBack} right={headerActions} title="Chats" />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {chatEligibleShindigs.length > 0 ? (
            chatEligibleShindigs.map((shindig) => {
              const preview = chatPreviewsByShindigId.get(shindig.id);
              const coverUri =
                shindig.coverPhotoThumbnailUrl ||
                shindig.coverPhotoUrl ||
                shindig.stops[0]?.photos[0]?.thumbnailUrl ||
                shindig.stops[0]?.photos[0]?.photoUrl ||
                'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80';

              return (
                <Pressable
                  key={shindig.id}
                  onPress={() => setActiveShindigId(shindig.id)}
                  style={styles.chatCard}
                >
                  <Image source={{ uri: coverUri }} style={styles.chatCardImage} />
                  <View style={styles.chatCardCopy}>
                    <View style={styles.chatCardTopRow}>
                      <Text numberOfLines={1} style={styles.chatCardTitle}>
                        {shindig.title}
                      </Text>
                      {preview?.lastMessage ? (
                        <Text style={styles.chatCardDate}>
                          {formatChatPreviewTime(preview.lastMessage.createdAt)}
                        </Text>
                      ) : null}
                    </View>
                    <Text numberOfLines={1} style={styles.chatCardMeta}>
                      {preview?.lastMessage
                        ? `${preview.lastMessage.author.name}: ${preview.lastMessage.body}`
                        : 'No messages yet'}
                    </Text>
                  </View>
                  {(unreadChatNotificationCountByShindigId.get(shindig.id) || 0) > 0 ? (
                    <View style={styles.unreadDot} />
                  ) : null}
                  <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={18} />
                </Pressable>
              );
            })
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No shindig chats yet</Text>
              <Text style={styles.emptyText}>
                Chats appear for ShinDigs you host or accepted invites you joined.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
    paddingTop: 28,
  },
  list: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
    paddingTop: theme.spacing.xl,
  },
  chatCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  chatCardImage: {
    borderRadius: theme.radius.lg,
    height: 62,
    width: 62,
  },
  chatCardCopy: {
    flex: 1,
    minWidth: 0,
  },
  chatCardTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  chatCardTitle: {
    color: theme.colors.textPrimary,
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  chatCardDate: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  chatCardMeta: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginTop: 6,
  },
  unreadDot: {
    backgroundColor: theme.colors.accentPink,
    borderRadius: theme.radius.round,
    height: 10,
    width: 10,
  },
  threadList: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
  },
  messageRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  messageAvatar: {
    borderRadius: theme.radius.round,
    height: 30,
    width: 30,
  },
  messageBubble: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.lg,
    maxWidth: '82%',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  messageBubbleMine: {
    backgroundColor: theme.colors.accentPink,
  },
  messageAuthor: {
    color: theme.colors.accentSoft,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  messageBody: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  messageBodyMine: {
    color: '#FFFFFF',
  },
  messageTime: {
    color: theme.colors.textMuted,
    fontSize: 10,
    marginTop: 6,
  },
  messageTimeMine: {
    color: 'rgba(255,255,255,0.82)',
  },
  composer: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    padding: theme.spacing.sm,
  },
  input: {
    color: theme.colors.textPrimary,
    flex: 1,
    fontSize: 14,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.accentPink,
    borderRadius: theme.radius.round,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.textMuted,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    marginTop: theme.spacing.xl,
    padding: theme.spacing.xl,
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    lineHeight: 20,
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
});
