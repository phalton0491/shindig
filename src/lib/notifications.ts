import { AppNotification } from '../types/models';
import { sendPushNotification } from './push';
import { getFriendProfilesByIds } from './profiles';
import { supabase } from './supabase';

type NotificationRow = {
  actor_user_id: string;
  created_at: string;
  id: string;
  invite_id: string | null;
  message: string;
  photo_id: string | null;
  read_at: string | null;
  recipient_user_id: string;
  request_id: string | null;
  shindig_id: string | null;
  type: AppNotification['type'];
};

type PhotoRequestRow = {
  id: string;
  photo_url: string;
  status: 'approved' | 'pending' | 'rejected';
};

type InviteRow = {
  id: string;
  status: 'accepted' | 'maybe' | 'pending' | 'rejected';
};

type NotificationShindigRow = {
  id: string;
  planned_for: string | null;
  state: AppNotification['shindigState'];
};

function client() {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  return supabase;
}

function isMissingNotificationSchema(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === '42P01' ||
    candidate.message?.toLowerCase().includes('notifications') === true
  );
}

function notificationPushTitle(type: AppNotification['type']) {
  switch (type) {
    case 'shindig_chat_message':
      return 'New ShinDig Message';
    case 'shindig_invite':
      return 'ShinDig Invite';
    case 'shindig_bring_item':
      return 'ShinDig Bring List';
    case 'photo_add_request':
      return 'Photo Request';
    case 'photo_comment':
    case 'photo_like':
      return 'ShinDig Photo Update';
    case 'shindig_comment':
    case 'shindig_like':
      return 'ShinDig Update';
    case 'friend_request':
      return 'Friend Request';
    case 'friend_accept':
    case 'friend_reject':
      return 'Friend Update';
    default:
      return 'ShinDig';
  }
}

export async function createNotification(args: {
  actorUserId: string;
  inviteId?: string;
  message: string;
  photoId?: string;
  requestId?: string;
  recipientUserId: string;
  shindigId?: string;
  type: AppNotification['type'];
}) {
  if (args.actorUserId === args.recipientUserId) {
    return;
  }

  if (args.inviteId) {
    const { data: existingInviteNotification, error: existingInviteNotificationError } =
      await client()
        .from('notifications')
        .select('id')
        .eq('invite_id', args.inviteId)
        .eq('recipient_user_id', args.recipientUserId)
        .eq('type', args.type)
        .maybeSingle();

    if (existingInviteNotificationError && !isMissingNotificationSchema(existingInviteNotificationError)) {
      throw existingInviteNotificationError;
    }

    if (existingInviteNotification?.id) {
      return;
    }
  }

  const { error } = await client().from('notifications').insert({
    actor_user_id: args.actorUserId,
    invite_id: args.inviteId || null,
    message: args.message,
    photo_id: args.photoId || null,
    recipient_user_id: args.recipientUserId,
    request_id: args.requestId || null,
    shindig_id: args.shindigId || null,
    type: args.type,
  });

  if (error && isMissingNotificationSchema(error)) {
    throw new Error(
      'Your Supabase database is missing the notifications table. Run the latest supabase/schema.sql first.'
    );
  }

  if (error) {
    throw error;
  }

  await sendPushNotification({
    body: args.message,
    data: {
      actorUserId: args.actorUserId,
      inviteId: args.inviteId || null,
      photoId: args.photoId || null,
      requestId: args.requestId || null,
      shindigId: args.shindigId || null,
      type: args.type,
    },
    recipientUserId: args.recipientUserId,
    title: notificationPushTitle(args.type),
  });
}

export async function listNotificationsForUser(userId: string) {
  const { data, error } = await client()
    .from('notifications')
    .select(
      'id, recipient_user_id, actor_user_id, shindig_id, photo_id, request_id, invite_id, type, message, created_at, read_at'
    )
    .eq('recipient_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error && isMissingNotificationSchema(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  const rows = (data || []) as NotificationRow[];
  const actorIds = Array.from(new Set(rows.map((row) => row.actor_user_id)));
  const requestIds = rows
    .map((row) => row.request_id)
    .filter((requestId): requestId is string => Boolean(requestId));
  const inviteIds = rows
    .map((row) => row.invite_id)
    .filter((inviteId): inviteId is string => Boolean(inviteId));
  const shindigIds = rows
    .map((row) => row.shindig_id)
    .filter((shindigId): shindigId is string => Boolean(shindigId));
  const actorProfiles = await getFriendProfilesByIds(actorIds);
  const actorsById = new Map(actorProfiles.map((profile) => [profile.id, profile]));
  let requestRowsById = new Map<string, PhotoRequestRow>();
  let inviteRowsById = new Map<string, InviteRow>();
  let shindigRowsById = new Map<string, NotificationShindigRow>();

  if (requestIds.length > 0) {
    const { data: requestRows, error: requestRowsError } = await client()
      .from('shindig_photo_requests')
      .select('id, photo_url, status')
      .in('id', requestIds);

    if (!requestRowsError) {
      requestRowsById = new Map(
        ((requestRows || []) as PhotoRequestRow[]).map((row) => [row.id, row])
      );
    }
  }

  if (inviteIds.length > 0) {
    const { data: inviteRows, error: inviteRowsError } = await client()
      .from('shindig_invites')
      .select('id, status')
      .in('id', inviteIds);

    if (!inviteRowsError) {
      inviteRowsById = new Map(((inviteRows || []) as InviteRow[]).map((row) => [row.id, row]));
    }
  }

  if (shindigIds.length > 0) {
    const { data: shindigRows, error: shindigRowsError } = await client()
      .from('shindigs')
      .select('id, state, planned_for')
      .in('id', shindigIds);

    if (!shindigRowsError) {
      shindigRowsById = new Map(
        ((shindigRows || []) as NotificationShindigRow[]).map((row) => [row.id, row])
      );
    }
  }

  return rows
    .map((row) => {
      const actor = actorsById.get(row.actor_user_id);
      if (!actor) {
        return null;
      }

      const notification: AppNotification = {
        actor,
        createdAt: row.created_at,
        id: row.id,
        message: row.message,
        type: row.type,
      };

      if (row.photo_id) {
        notification.photoId = row.photo_id;
      }
      if (row.invite_id) {
        notification.inviteId = row.invite_id;
        const inviteRow = inviteRowsById.get(row.invite_id);
        if (inviteRow) {
          notification.inviteStatus = inviteRow.status;
        }
      }
      if (row.request_id) {
        notification.requestId = row.request_id;
        const requestRow = requestRowsById.get(row.request_id);
        if (requestRow) {
          notification.requestPhotoUrl = requestRow.photo_url;
          notification.requestStatus = requestRow.status;
        }
      }
      if (row.read_at) {
        notification.readAt = row.read_at;
      }
      if (row.shindig_id) {
        notification.shindigId = row.shindig_id;
        const shindigRow = shindigRowsById.get(row.shindig_id);
        if (shindigRow) {
          notification.shindigPlannedFor = shindigRow.planned_for;
          notification.shindigState = shindigRow.state;
        }
      }

      return notification;
    })
    .filter((notification): notification is AppNotification => Boolean(notification));
}

export async function markNotificationsRead(userId: string) {
  const { error } = await client()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_user_id', userId)
    .is('read_at', null);

  if (error && isMissingNotificationSchema(error)) {
    return;
  }

  if (error) {
    throw error;
  }
}

export async function markChatNotificationsRead(args: {
  shindigId?: string;
  userId: string;
}) {
  let query = client()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_user_id', args.userId)
    .eq('type', 'shindig_chat_message')
    .is('read_at', null);

  if (args.shindigId) {
    query = query.eq('shindig_id', args.shindigId);
  }

  const { error } = await query;

  if (error && isMissingNotificationSchema(error)) {
    return;
  }

  if (error) {
    throw error;
  }
}

export async function dismissFriendRequestNotification(args: {
  actorUserId: string;
  recipientUserId: string;
}) {
  const { error } = await client()
    .from('notifications')
    .delete()
    .eq('actor_user_id', args.actorUserId)
    .eq('recipient_user_id', args.recipientUserId)
    .eq('type', 'friend_request');

  if (error && isMissingNotificationSchema(error)) {
    return;
  }

  if (error) {
    throw error;
  }
}

export async function resolveFriendRequestNotification(args: {
  actorUserId: string;
  recipientUserId: string;
  resolution: 'accepted' | 'rejected';
}) {
  const nextType = args.resolution === 'accepted' ? 'friend_accept' : 'friend_reject';
  const nextMessage =
    args.resolution === 'accepted'
      ? 'Accepted friend request.'
      : 'Rejected friend request.';

  const { error } = await client()
    .from('notifications')
    .update({
      message: nextMessage,
      read_at: new Date().toISOString(),
      type: nextType,
    })
    .eq('actor_user_id', args.actorUserId)
    .eq('recipient_user_id', args.recipientUserId)
    .eq('type', 'friend_request');

  if (error && isMissingNotificationSchema(error)) {
    return;
  }

  if (error) {
    throw error;
  }
}

export async function dismissPhotoRequestNotification(args: {
  recipientUserId: string;
  requestId: string;
}) {
  const { error } = await client()
    .from('notifications')
    .delete()
    .eq('recipient_user_id', args.recipientUserId)
    .eq('request_id', args.requestId)
    .eq('type', 'photo_add_request');

  if (error && isMissingNotificationSchema(error)) {
    return;
  }

  if (error) {
    throw error;
  }
}
