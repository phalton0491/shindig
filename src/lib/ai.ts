import { supabase } from './supabase';

type GenerateShindigCoverArgs = {
  location?: string;
  prompt: string;
  scheduledFor?: string | null;
  title?: string;
};

type GenerateShindigCoverResult = {
  base64: string;
  mimeType: string;
};

function client() {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  return supabase;
}

export async function generateShindigCover(args: GenerateShindigCoverArgs) {
  const { data, error } = await client().functions.invoke('generate-shindig-cover', {
    body: {
      location: args.location || null,
      prompt: args.prompt,
      scheduledFor: args.scheduledFor || null,
      title: args.title || null,
    },
  });

  if (error) {
    throw new Error(error.message || 'Could not generate a cover image right now.');
  }

  const result = data as Partial<GenerateShindigCoverResult> | null;
  if (!result?.base64 || !result?.mimeType) {
    throw new Error('The generated cover image response was incomplete.');
  }

  return {
    base64: result.base64,
    mimeType: result.mimeType,
  } satisfies GenerateShindigCoverResult;
}
