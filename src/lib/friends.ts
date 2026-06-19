import { FriendProfile } from '../types/models';
import { getFriendProfilesByIds } from './profiles';
import { supabase } from './supabase';

type FriendshipRow = {
  created_at: string;
  friend_id: string;
  user_id: string;
};

function client() {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  return supabase;
}

function isMissingFriendshipSchema(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === '42P01' ||
    candidate.message?.toLowerCase().includes('friendships') === true
  );
}

function canonicalFriendPair(userId: string, friendId: string) {
  return userId.localeCompare(friendId) <= 0
    ? { friend_id: friendId, user_id: userId }
    : { friend_id: userId, user_id: friendId };
}

export async function listFriendIdsForUser(userId: string) {
  const { data, error } = await client()
    .from('friendships')
    .select('user_id, friend_id, created_at')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

  if (error && isMissingFriendshipSchema(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data || []) as FriendshipRow[]).map((row) =>
    row.user_id === userId ? row.friend_id : row.user_id
  );
}

export async function listFriendsForUser(userId: string) {
  const friendIds = await listFriendIdsForUser(userId);
  if (friendIds.length === 0) {
    return [];
  }

  return getFriendProfilesByIds(friendIds);
}

export async function addFriend(args: { friendId: string; userId: string }) {
  if (args.friendId === args.userId) {
    throw new Error('You cannot add yourself as a friend.');
  }

  const payload = canonicalFriendPair(args.userId, args.friendId);
  const { error } = await client().from('friendships').upsert(payload);

  if (error && isMissingFriendshipSchema(error)) {
    throw new Error(
      'Your Supabase database is missing the friendships table. Run the latest supabase/schema.sql first.'
    );
  }

  if (error) {
    throw error;
  }
}

export async function refreshFriends(args: {
  currentFriends: FriendProfile[];
  userId: string;
}) {
  return listFriendsForUser(args.userId);
}
