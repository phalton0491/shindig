import {
  FriendProfile,
  ShindigChatMessage,
  ShindigChatPreview,
} from '../types/models';
import { getFriendProfilesByIds } from './profiles';
import { supabase } from './supabase';

type ChatMessageRow = {
  body: string;
  created_at: string;
  id: string;
  shindig_id: string;
  user_id: string;
};

function client() {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  return supabase;
}

function isMissingChatSchema(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === '42P01' ||
    candidate.message?.toLowerCase().includes('shindig_chat_messages') === true
  );
}

async function mapChatMessages(rows: ChatMessageRow[]) {
  const authorIds = Array.from(new Set(rows.map((row) => row.user_id)));
  const profiles = await getFriendProfilesByIds(authorIds);
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

  return rows
    .map((row) => {
      const author = profilesById.get(row.user_id);
      if (!author) {
        return null;
      }

      return {
        author,
        body: row.body,
        createdAt: row.created_at,
        id: row.id,
        shindigId: row.shindig_id,
      } satisfies ShindigChatMessage;
    })
    .filter((message): message is ShindigChatMessage => Boolean(message));
}

export async function listShindigChatMessages(args: {
  shindigId: string;
  userId: string;
}) {
  const { data, error } = await client()
    .from('shindig_chat_messages')
    .select('id, shindig_id, user_id, body, created_at')
    .eq('shindig_id', args.shindigId)
    .order('created_at', { ascending: true });

  if (error && isMissingChatSchema(error)) {
    return [] as ShindigChatMessage[];
  }

  if (error) {
    throw error;
  }

  return mapChatMessages((data || []) as ChatMessageRow[]);
}

export async function listShindigChatPreviews(args: {
  shindigIds: string[];
  userId: string;
}) {
  if (args.shindigIds.length === 0) {
    return [] as ShindigChatPreview[];
  }

  const { data, error } = await client()
    .from('shindig_chat_messages')
    .select('id, shindig_id, user_id, body, created_at')
    .in('shindig_id', args.shindigIds)
    .order('created_at', { ascending: false })
    .limit(Math.max(args.shindigIds.length * 10, 50));

  if (error && isMissingChatSchema(error)) {
    return args.shindigIds.map((shindigId) => ({ shindigId }));
  }

  if (error) {
    throw error;
  }

  const messages = await mapChatMessages((data || []) as ChatMessageRow[]);
  const lastMessageByShindigId = new Map<string, ShindigChatMessage>();

  for (const message of messages) {
    if (!lastMessageByShindigId.has(message.shindigId)) {
      lastMessageByShindigId.set(message.shindigId, message);
    }
  }

  return args.shindigIds.map((shindigId) => ({
    lastMessage: lastMessageByShindigId.get(shindigId),
    shindigId,
  }));
}

export async function sendShindigChatMessage(args: {
  body: string;
  shindigId: string;
  userId: string;
}) {
  const nextBody = args.body.trim();
  if (!nextBody) {
    throw new Error('Type a message first.');
  }

  const { data, error } = await client()
    .from('shindig_chat_messages')
    .insert({
      body: nextBody,
      shindig_id: args.shindigId,
      user_id: args.userId,
    })
    .select('id, shindig_id, user_id, body, created_at')
    .single();

  if (error && isMissingChatSchema(error)) {
    throw new Error(
      'Your Supabase database is missing the shindig chat table. Run the latest supabase/schema.sql first.'
    );
  }

  if (error || !data) {
    throw error || new Error('Failed to send that message.');
  }

  const [message] = await mapChatMessages([data as ChatMessageRow]);
  if (!message) {
    throw new Error('That message could not be loaded after sending.');
  }

  return message;
}
