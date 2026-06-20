import { FriendProfile, FriendRequest } from '../types/models';
import { getFriendProfilesByIds } from './profiles';
import { supabase } from './supabase';

type FriendshipRow = {
  created_at: string;
  friend_id: string;
  requester_id: string;
  status: 'confirmed' | 'pending';
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

async function listFriendshipRows(userId: string) {
  const { data, error } = await client()
    .from('friendships')
    .select('user_id, friend_id, requester_id, status, created_at')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

  if (error && isMissingFriendshipSchema(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return (data || []) as FriendshipRow[];
}

export async function listFriendIdsForUser(userId: string) {
  const rows = await listFriendshipRows(userId);

  return rows
    .filter((row) => row.status === 'confirmed')
    .map((row) => (row.user_id === userId ? row.friend_id : row.user_id));
}

export async function listFriendsForUser(userId: string) {
  const friendIds = await listFriendIdsForUser(userId);
  if (friendIds.length === 0) {
    return [];
  }

  return getFriendProfilesByIds(friendIds);
}

export async function listFriendRequestsForUser(userId: string) {
  const rows = (await listFriendshipRows(userId)).filter((row) => row.status === 'pending');
  if (rows.length === 0) {
    return [];
  }

  const counterpartIds = rows.map((row) => (row.user_id === userId ? row.friend_id : row.user_id));
  const profiles = await getFriendProfilesByIds(counterpartIds);
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

  return rows
    .map((row) => {
      const counterpartId = row.user_id === userId ? row.friend_id : row.user_id;
      const profile = profilesById.get(counterpartId);
      if (!profile) {
        return null;
      }

      return {
        createdAt: row.created_at,
        direction: row.requester_id === userId ? 'outgoing' : 'incoming',
        profile,
        status: 'pending',
      } satisfies FriendRequest;
    })
    .filter((request): request is FriendRequest => Boolean(request));
}

export async function sendFriendRequest(args: { friendId: string; userId: string }) {
  if (args.friendId === args.userId) {
    throw new Error('You cannot add yourself as a friend.');
  }

  const pair = canonicalFriendPair(args.userId, args.friendId);
  const { data: existingRow, error: existingRowError } = await client()
    .from('friendships')
    .select('user_id, friend_id, requester_id, status, created_at')
    .eq('user_id', pair.user_id)
    .eq('friend_id', pair.friend_id)
    .maybeSingle();

  if (existingRowError && isMissingFriendshipSchema(existingRowError)) {
    throw new Error(
      'Your Supabase database is missing the friendships table. Run the latest supabase/schema.sql first.'
    );
  }

  if (existingRowError) {
    throw existingRowError;
  }

  if (existingRow) {
    const friendship = existingRow as FriendshipRow;

    if (friendship.status === 'confirmed') {
      return { status: 'confirmed' as const };
    }

    if (friendship.requester_id === args.userId) {
      return { status: 'pending' as const };
    }

    const { error } = await client()
      .from('friendships')
      .update({ status: 'confirmed' })
      .eq('user_id', pair.user_id)
      .eq('friend_id', pair.friend_id)
      .eq('status', 'pending');

    if (error) {
      throw error;
    }

    return { status: 'confirmed' as const };
  }

  const payload = {
    ...pair,
    requester_id: args.userId,
    status: 'pending' as const,
  };
  const { error } = await client().from('friendships').insert(payload);

  if (error && isMissingFriendshipSchema(error)) {
    throw new Error(
      'Your Supabase database is missing the friendships table. Run the latest supabase/schema.sql first.'
    );
  }

  if (error) {
    throw error;
  }

  return { status: 'pending' as const };
}

export async function acceptFriendRequest(args: { friendId: string; userId: string }) {
  const pair = canonicalFriendPair(args.userId, args.friendId);
  const { error } = await client()
    .from('friendships')
    .update({ status: 'confirmed' })
    .eq('user_id', pair.user_id)
    .eq('friend_id', pair.friend_id)
    .eq('status', 'pending');

  if (error && isMissingFriendshipSchema(error)) {
    throw new Error(
      'Your Supabase database is missing the friendships table. Run the latest supabase/schema.sql first.'
    );
  }

  if (error) {
    throw error;
  }
}

export async function rejectFriendRequest(args: { friendId: string; userId: string }) {
  const pair = canonicalFriendPair(args.userId, args.friendId);
  const { error } = await client()
    .from('friendships')
    .delete()
    .eq('user_id', pair.user_id)
    .eq('friend_id', pair.friend_id)
    .eq('status', 'pending');

  if (error && isMissingFriendshipSchema(error)) {
    throw new Error(
      'Your Supabase database is missing the friendships table. Run the latest supabase/schema.sql first.'
    );
  }

  if (error) {
    throw error;
  }
}

export const addFriend = sendFriendRequest;
