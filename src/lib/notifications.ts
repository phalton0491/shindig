import { AppNotification } from '../types/models';
import { getFriendProfilesByIds } from './profiles';
import { supabase } from './supabase';

type NotificationRow = {
  actor_user_id: string;
  created_at: string;
  id: string;
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

export async function createNotification(args: {
  actorUserId: string;
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

  const { error } = await client().from('notifications').insert({
    actor_user_id: args.actorUserId,
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
}

export async function listNotificationsForUser(userId: string) {
  const { data, error } = await client()
    .from('notifications')
    .select(
      'id, recipient_user_id, actor_user_id, shindig_id, photo_id, request_id, type, message, created_at, read_at'
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
  const actorProfiles = await getFriendProfilesByIds(actorIds);
  const actorsById = new Map(actorProfiles.map((profile) => [profile.id, profile]));
  let requestRowsById = new Map<string, PhotoRequestRow>();

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
