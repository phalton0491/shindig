import { User } from '@supabase/supabase-js';

import { UserProfile } from '../data/mockProfile';
import { supabase } from './supabase';

type ProfileRow = {
  avatar_url: string | null;
  bio: string | null;
  city: string | null;
  first_name: string | null;
  id: string;
  last_name: string | null;
  username: string;
};

function client() {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  return supabase;
}

const AVATAR_BUCKET = 'avatars';

function defaultAvatar(firstName: string, lastName: string) {
  const initials = `${firstName.slice(0, 1)}${lastName.slice(0, 1)}`.toUpperCase();
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    initials || 'SD'
  )}&background=141C2F&color=F4F7FB&size=256`;
}

function mapProfile(row: ProfileRow): UserProfile {
  const firstName = row.first_name?.trim() || 'Shin';
  const lastName = row.last_name?.trim() || 'User';

  return {
    name: `${firstName} ${lastName}`.trim(),
    handle: `@${row.username}`,
    city: row.city?.trim() || 'Add your city',
    bio: row.bio?.trim() || 'Tell people what your best days and nights look like.',
    avatar: row.avatar_url || defaultAvatar(firstName, lastName),
    stats: {
      outings: 24,
      friends: 182,
      saves: 89,
    },
  };
}

function usernameFromUser(user: User) {
  const metadataUsername = user.user_metadata.username;
  if (typeof metadataUsername === 'string' && metadataUsername.trim()) {
    return metadataUsername.trim().toLowerCase();
  }

  const emailPrefix = user.email?.split('@')[0];
  if (emailPrefix) {
    return emailPrefix.toLowerCase();
  }

  return `user-${user.id.slice(0, 8)}`;
}

async function createProfile(user: User) {
  const firstName =
    typeof user.user_metadata.first_name === 'string'
      ? user.user_metadata.first_name
      : typeof user.user_metadata.full_name === 'string'
        ? user.user_metadata.full_name.split(' ')[0]
        : 'Shin';
  const lastName =
    typeof user.user_metadata.last_name === 'string'
      ? user.user_metadata.last_name
      : typeof user.user_metadata.full_name === 'string'
        ? user.user_metadata.full_name.split(' ').slice(1).join(' ')
        : 'User';

  const row = {
    id: user.id,
    username: usernameFromUser(user),
    first_name: firstName || 'Shin',
    last_name: lastName || 'User',
    city: 'Brooklyn, NY',
    bio: 'Collecting rooftop sunsets, late-night food runs, and full-camera-roll weekends.',
    avatar_url:
      typeof user.user_metadata.avatar_url === 'string'
        ? user.user_metadata.avatar_url
        : defaultAvatar(firstName || 'Shin', lastName || 'User'),
  };

  const { data, error } = await client()
    .from('profiles')
    .upsert(row)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return mapProfile(data as ProfileRow);
}

export async function getProfileForUser(userId: string) {
  const { data, error } = await client()
    .from('profiles')
    .select('id, username, first_name, last_name, city, bio, avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapProfile(data as ProfileRow) : null;
}

export async function ensureProfileForUser(user: User) {
  const existing = await getProfileForUser(user.id);
  if (existing) {
    return existing;
  }

  return createProfile(user);
}

export async function updateProfile(userId: string, profile: UserProfile) {
  const names = profile.name.trim().split(/\s+/);
  const firstName = names[0] || 'Shin';
  const lastName = names.slice(1).join(' ') || 'User';

  const payload = {
    avatar_url: profile.avatar,
    bio: profile.bio,
    city: profile.city,
    first_name: firstName,
    last_name: lastName,
  };

  const { data, error } = await client()
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select('id, username, first_name, last_name, city, bio, avatar_url')
    .single();

  if (error) {
    throw error;
  }

  return mapProfile(data as ProfileRow);
}

function decodeBase64ToArrayBuffer(base64: string) {
  const decoder = globalThis.atob;
  if (!decoder) {
    throw new Error('Base64 decoding is not available in this environment.');
  }

  const binary = decoder(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

export async function uploadProfileAvatarData(args: {
  base64: string;
  contentType?: string;
  fileExtension?: string;
  userId: string;
}) {
  const contentType = args.contentType || `image/${args.fileExtension || 'jpg'}`;
  const fileExtension = args.fileExtension || 'jpg';
  const filePath = `${args.userId}/${Date.now()}.${fileExtension}`;
  const avatarBuffer = decodeBase64ToArrayBuffer(args.base64);

  const { error } = await client().storage
    .from(AVATAR_BUCKET)
    .upload(filePath, avatarBuffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw error;
  }

  const signedUrlResult = await client().storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(filePath, 60 * 60 * 24 * 365);

  if (!signedUrlResult.error && signedUrlResult.data?.signedUrl) {
    return signedUrlResult.data.signedUrl;
  }

  const { data } = client().storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}
