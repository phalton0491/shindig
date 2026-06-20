import {
  FeedComment,
  FeedShindig,
  SavedShindig,
  SavedShindigPhoto,
  SavedShindigStop,
  TimelinePlace,
} from '../types/models';
import { getFriendProfilesByIds } from './profiles';
import { supabase } from './supabase';

type DraftStopPhoto = {
  base64: string;
  contentType?: string;
  fileExtension?: string;
  localUri: string;
};

type CreateShindigStopInput = {
  photos: DraftStopPhoto[];
  place: TimelinePlace;
  scheduledTime?: string;
};

type ShindigRow = {
  created_at: string;
  id: string;
  title: string;
  user_id: string;
};

type ShindigStopRow = {
  address: string;
  id: string;
  latitude: number;
  longitude: number;
  place_type: string | null;
  scheduled_time: string | null;
  shindig_id: string;
  stop_order: number;
  title: string;
  transit_miles: number;
  transit_minutes: number;
};

type ShindigPhotoRow = {
  contributor_user_id: string | null;
  id: string;
  photo_url: string;
  shindig_id: string;
  stop_id: string;
};

type ShindigLikeRow = {
  shindig_id: string;
  user_id: string;
};

type ShindigCommentRow = {
  body: string;
  created_at: string;
  id: string;
  shindig_id: string;
  user_id: string;
};

type ShindigPhotoLikeRow = {
  photo_id: string;
  user_id: string;
};

type ShindigPhotoCommentRow = {
  body: string;
  created_at: string;
  id: string;
  photo_id: string;
  user_id: string;
};

type ShindigPhotoRequestRow = {
  created_at: string;
  id: string;
  photo_url: string;
  recipient_user_id: string;
  requester_user_id: string;
  shindig_id: string;
  status: 'approved' | 'pending' | 'rejected';
  stop_id: string;
};

const SHINDIG_PHOTOS_BUCKET = 'shindig-photos';

function isMissingShindigSchema(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === '42P01' ||
    candidate.message?.toLowerCase().includes('relation') === true ||
    candidate.message?.toLowerCase().includes('does not exist') === true
  );
}

function client() {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  return supabase;
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

async function uploadStopPhoto(args: {
  photo: DraftStopPhoto;
  shindigId: string;
  stopId: string;
  userId: string;
}) {
  const fileExtension = args.photo.fileExtension || 'jpg';
  const contentType = args.photo.contentType || `image/${fileExtension}`;
  const filePath = `${args.userId}/${args.shindigId}/${args.stopId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${fileExtension}`;
  const photoBuffer = decodeBase64ToArrayBuffer(args.photo.base64);

  const { error } = await client().storage
    .from(SHINDIG_PHOTOS_BUCKET)
    .upload(filePath, photoBuffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  const signedUrlResult = await client().storage
    .from(SHINDIG_PHOTOS_BUCKET)
    .createSignedUrl(filePath, 60 * 60 * 24 * 365);

  if (!signedUrlResult.error && signedUrlResult.data?.signedUrl) {
    return signedUrlResult.data.signedUrl;
  }

  const { data } = client().storage.from(SHINDIG_PHOTOS_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

async function getFirstStopIdForShindig(shindigId: string) {
  const { data, error } = await client()
    .from('shindig_stops')
    .select('id')
    .eq('shindig_id', shindigId)
    .order('stop_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.id) {
    throw new Error('This ShinDig does not have a stop to attach the photo to.');
  }

  return data.id as string;
}

function buildShindigTitle(args: { providedTitle?: string; stops: CreateShindigStopInput[] }) {
  const normalizedTitle = args.providedTitle?.trim();
  if (normalizedTitle) {
    return normalizedTitle;
  }

  const stops = args.stops;
  if (stops.length === 0) {
    return 'ShinDig';
  }
  if (stops.length === 1) {
    return stops[0].place.title;
  }

  return `${stops[0].place.title} + ${stops.length - 1} more`;
}

function mapComments<T extends { body: string; created_at: string; id: string; user_id: string }>(
  rows: T[],
  profilesById: Map<string, Awaited<ReturnType<typeof getFriendProfilesByIds>>[number]>
) {
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
      } satisfies FeedComment;
    })
    .filter((comment): comment is FeedComment => Boolean(comment));
}

function mapShindigs(args: {
  currentUserId: string;
  photoComments: ShindigPhotoCommentRow[];
  photoLikes: ShindigPhotoLikeRow[];
  photos: ShindigPhotoRow[];
  profilesById: Map<string, Awaited<ReturnType<typeof getFriendProfilesByIds>>[number]>;
  shindigComments: ShindigCommentRow[];
  shindigLikes: ShindigLikeRow[];
  shindigs: ShindigRow[];
  stops: ShindigStopRow[];
}): SavedShindig[] {
  return args.shindigs.map((shindig) => {
    const shindigComments = mapComments(
      args.shindigComments.filter((comment) => comment.shindig_id === shindig.id),
      args.profilesById
    );
    const shindigLikes = args.shindigLikes.filter((like) => like.shindig_id === shindig.id);
    const stops = args.stops
      .filter((stop) => stop.shindig_id === shindig.id)
      .sort((left, right) => left.stop_order - right.stop_order)
      .map((stop) => {
        const photos = args.photos
          .filter((photo) => photo.stop_id === stop.id)
          .map<SavedShindigPhoto>((photo) => ({
            comments: mapComments(
              args.photoComments.filter((comment) => comment.photo_id === photo.id),
              args.profilesById
            ),
            contributor: photo.contributor_user_id
              ? args.profilesById.get(photo.contributor_user_id)
              : undefined,
            id: photo.id,
            likeCount: args.photoLikes.filter((like) => like.photo_id === photo.id).length,
            likedByMe: args.photoLikes.some(
              (like) => like.photo_id === photo.id && like.user_id === args.currentUserId
            ),
            photoUrl: photo.photo_url,
            stopId: photo.stop_id,
          }));

        return {
          id: stop.id,
          order: stop.stop_order,
          photos,
          place: {
            address: stop.address,
            durationLabel: '1 hr 30 min',
            id: stop.id,
            latitude: stop.latitude,
            longitude: stop.longitude,
            title: stop.title,
            transitMinutes: stop.transit_minutes,
            transitMiles: stop.transit_miles,
            type: stop.place_type || 'Place',
            vibeIds: [],
          },
          scheduledTime: stop.scheduled_time || undefined,
        } satisfies SavedShindigStop;
      });

    const photos = stops.flatMap((stop) => stop.photos);

    return {
      comments: shindigComments,
      coverPhotoUrl: photos[0]?.photoUrl || null,
      createdAt: shindig.created_at,
      id: shindig.id,
      likeCount: shindigLikes.length,
      likedByMe: shindigLikes.some((like) => like.user_id === args.currentUserId),
      ownerId: shindig.user_id,
      photoCount: photos.length,
      stops,
      title: shindig.title,
    } satisfies SavedShindig;
  });
}

async function loadStopsAndPhotos(shindigIds: string[]) {
  if (shindigIds.length === 0) {
    return {
      photos: [] as ShindigPhotoRow[],
      stops: [] as ShindigStopRow[],
    };
  }

  const [{ data: stops, error: stopsError }, { data: photos, error: photosError }] =
    await Promise.all([
      client()
        .from('shindig_stops')
        .select(
          'id, shindig_id, stop_order, title, place_type, address, latitude, longitude, transit_minutes, transit_miles, scheduled_time'
        )
        .in('shindig_id', shindigIds)
        .order('stop_order', { ascending: true }),
      client()
        .from('shindig_photos')
        .select('id, shindig_id, stop_id, photo_url, contributor_user_id')
        .in('shindig_id', shindigIds),
    ]);

  if (stopsError && isMissingShindigSchema(stopsError)) {
    return { photos: [], stops: [] };
  }
  if (photosError && isMissingShindigSchema(photosError)) {
    return { photos: [], stops: [] };
  }
  if (stopsError) {
    throw stopsError;
  }
  if (photosError) {
    throw photosError;
  }

  return {
    photos: (photos || []) as ShindigPhotoRow[],
    stops: (stops || []) as ShindigStopRow[],
  };
}

async function loadSocialRows(shindigIds: string[], photoIds: string[]) {
  if (shindigIds.length === 0) {
    return {
      photoComments: [] as ShindigPhotoCommentRow[],
      photoLikes: [] as ShindigPhotoLikeRow[],
      shindigComments: [] as ShindigCommentRow[],
      shindigLikes: [] as ShindigLikeRow[],
    };
  }

  const [
    { data: shindigLikes, error: shindigLikesError },
    { data: shindigComments, error: shindigCommentsError },
    { data: photoLikes, error: photoLikesError },
    { data: photoComments, error: photoCommentsError },
  ] = await Promise.all([
    client().from('shindig_likes').select('shindig_id, user_id').in('shindig_id', shindigIds),
    client()
      .from('shindig_comments')
      .select('id, shindig_id, user_id, body, created_at')
      .in('shindig_id', shindigIds)
      .order('created_at', { ascending: false }),
    photoIds.length > 0
      ? client().from('shindig_photo_likes').select('photo_id, user_id').in('photo_id', photoIds)
      : Promise.resolve({ data: [], error: null }),
    photoIds.length > 0
      ? client()
          .from('shindig_photo_comments')
          .select('id, photo_id, user_id, body, created_at')
          .in('photo_id', photoIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const errors = [
    shindigLikesError,
    shindigCommentsError,
    photoLikesError,
    photoCommentsError,
  ];
  const schemaMissing = errors.some((error) => error && isMissingShindigSchema(error));
  if (schemaMissing) {
    return {
      photoComments: [],
      photoLikes: [],
      shindigComments: [],
      shindigLikes: [],
    };
  }
  const firstError = errors.find(Boolean);
  if (firstError) {
    throw firstError;
  }

  return {
    photoComments: (photoComments || []) as ShindigPhotoCommentRow[],
    photoLikes: (photoLikes || []) as ShindigPhotoLikeRow[],
    shindigComments: (shindigComments || []) as ShindigCommentRow[],
    shindigLikes: (shindigLikes || []) as ShindigLikeRow[],
  };
}

async function hydrateShindigs(args: {
  currentUserId: string;
  shindigRows: ShindigRow[];
}) {
  const childRows = await loadStopsAndPhotos(args.shindigRows.map((row) => row.id));
  const photoIds = childRows.photos.map((photo) => photo.id);
  const socialRows = await loadSocialRows(
    args.shindigRows.map((row) => row.id),
    photoIds
  );
  const authorIds = Array.from(
    new Set([
      ...args.shindigRows.map((row) => row.user_id),
      ...childRows.photos
        .map((photo) => photo.contributor_user_id)
        .filter((userId): userId is string => Boolean(userId)),
      ...socialRows.shindigComments.map((comment) => comment.user_id),
      ...socialRows.photoComments.map((comment) => comment.user_id),
    ])
  );
  const authorProfiles = await getFriendProfilesByIds(authorIds);
  const profilesById = new Map(authorProfiles.map((profile) => [profile.id, profile]));

  return mapShindigs({
    currentUserId: args.currentUserId,
    photoComments: socialRows.photoComments,
    photoLikes: socialRows.photoLikes,
    photos: childRows.photos,
    profilesById,
    shindigComments: socialRows.shindigComments,
    shindigLikes: socialRows.shindigLikes,
    shindigs: args.shindigRows,
    stops: childRows.stops,
  });
}

export async function listShindigsForUser(userId: string) {
  const { data: shindigs, error: shindigsError } = await client()
    .from('shindigs')
    .select('id, title, created_at, user_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (shindigsError && isMissingShindigSchema(shindigsError)) {
    return [];
  }
  if (shindigsError) {
    throw shindigsError;
  }

  const shindigRows = (shindigs || []) as ShindigRow[];
  return hydrateShindigs({
    currentUserId: userId,
    shindigRows,
  });
}

export async function listFeedShindigs(args: {
  friendIds: string[];
  userId: string;
}) {
  const ownerIds = Array.from(new Set([args.userId, ...args.friendIds]));
  const { data: shindigs, error: shindigsError } = await client()
    .from('shindigs')
    .select('id, title, created_at, user_id')
    .in('user_id', ownerIds)
    .order('created_at', { ascending: false });

  if (shindigsError && isMissingShindigSchema(shindigsError)) {
    return [];
  }
  if (shindigsError) {
    throw shindigsError;
  }

  const shindigRows = (shindigs || []) as ShindigRow[];
  const savedShindigs = await hydrateShindigs({
    currentUserId: args.userId,
    shindigRows,
  });
  const ownerProfiles = await getFriendProfilesByIds(ownerIds);
  const ownersById = new Map(ownerProfiles.map((owner) => [owner.id, owner]));

  return savedShindigs
    .map((shindig) => {
      const owner = ownersById.get(shindig.ownerId);
      if (!owner) {
        return null;
      }

      return {
        ...shindig,
        owner,
      } satisfies FeedShindig;
    })
    .filter((shindig): shindig is FeedShindig => Boolean(shindig));
}

export async function createShindig(args: {
  title?: string;
  stops: CreateShindigStopInput[];
  userId: string;
}) {
  if (args.stops.length === 0) {
    throw new Error('Add at least one stop before saving a ShinDig.');
  }

  const { data: shindigData, error: shindigError } = await client()
    .from('shindigs')
    .insert({
      title: buildShindigTitle({ providedTitle: args.title, stops: args.stops }),
      user_id: args.userId,
    })
    .select('id, title, created_at, user_id')
    .single();

  if (shindigError && isMissingShindigSchema(shindigError)) {
    throw new Error(
      'Your Supabase database is missing the new ShinDig tables. Run the latest supabase/schema.sql first.'
    );
  }

  if (shindigError || !shindigData) {
    throw shindigError || new Error('Failed to create shindig.');
  }

  const stopPayload = args.stops.map((stop, index) => ({
    address: stop.place.address,
    latitude: stop.place.latitude,
    longitude: stop.place.longitude,
    place_type: stop.place.type,
    scheduled_time: stop.scheduledTime || null,
    shindig_id: shindigData.id,
    stop_order: index + 1,
    title: stop.place.title,
    transit_miles: stop.place.transitMiles,
    transit_minutes: stop.place.transitMinutes,
  }));

  const { data: stopRows, error: stopsError } = await client()
    .from('shindig_stops')
    .insert(stopPayload)
    .select(
      'id, shindig_id, stop_order, title, place_type, address, latitude, longitude, transit_minutes, transit_miles, scheduled_time'
    );

  if (stopsError && isMissingShindigSchema(stopsError)) {
    throw new Error(
      'Your Supabase database is missing the new ShinDig tables. Run the latest supabase/schema.sql first.'
    );
  }

  if (stopsError || !stopRows) {
    throw stopsError || new Error('Failed to save shindig stops.');
  }

  const photoRows: ShindigPhotoRow[] = [];

  for (const stop of args.stops) {
    const matchingStop = (stopRows as ShindigStopRow[]).find(
      (row) =>
        row.title === stop.place.title &&
        row.address === stop.place.address
    );

    if (!matchingStop) {
      continue;
    }

    for (const photo of stop.photos) {
      const photoUrl = await uploadStopPhoto({
        photo,
        shindigId: shindigData.id,
        stopId: matchingStop.id,
        userId: args.userId,
      });

      const { data: savedPhoto, error: photoError } = await client()
        .from('shindig_photos')
        .insert({
          contributor_user_id: null,
          photo_url: photoUrl,
          shindig_id: shindigData.id,
          stop_id: matchingStop.id,
        })
        .select('id, shindig_id, stop_id, photo_url, contributor_user_id')
        .single();

      if (photoError || !savedPhoto) {
        throw photoError || new Error('Failed to save shindig photo.');
      }

      photoRows.push(savedPhoto as ShindigPhotoRow);
    }
  }

  return hydrateShindigs({
    currentUserId: args.userId,
    shindigRows: [shindigData as ShindigRow],
  }).then((rows) => rows[0]);
}

export async function toggleShindigLike(args: {
  shindigId: string;
  userId: string;
}) {
  const { data: existingLike, error: existingLikeError } = await client()
    .from('shindig_likes')
    .select('shindig_id, user_id')
    .eq('shindig_id', args.shindigId)
    .eq('user_id', args.userId)
    .maybeSingle();

  if (existingLikeError && !isMissingShindigSchema(existingLikeError)) {
    throw existingLikeError;
  }

  if (existingLike) {
    const { error } = await client()
      .from('shindig_likes')
      .delete()
      .eq('shindig_id', args.shindigId)
      .eq('user_id', args.userId);

    if (error) {
      throw error;
    }
  } else {
    const { error } = await client().from('shindig_likes').insert({
      shindig_id: args.shindigId,
      user_id: args.userId,
    });

    if (error) {
      throw error;
    }
  }
}

export async function addShindigComment(args: {
  body: string;
  shindigId: string;
  userId: string;
}) {
  const { error } = await client().from('shindig_comments').insert({
    body: args.body.trim(),
    shindig_id: args.shindigId,
    user_id: args.userId,
  });

  if (error) {
    throw error;
  }
}

export async function deleteShindigComment(args: {
  commentId: string;
  userId: string;
}) {
  const { error } = await client()
    .from('shindig_comments')
    .delete()
    .eq('id', args.commentId)
    .eq('user_id', args.userId);

  if (error) {
    throw error;
  }
}

export async function togglePhotoLike(args: {
  photoId: string;
  userId: string;
}) {
  const { data: existingLike, error: existingLikeError } = await client()
    .from('shindig_photo_likes')
    .select('photo_id, user_id')
    .eq('photo_id', args.photoId)
    .eq('user_id', args.userId)
    .maybeSingle();

  if (existingLikeError && !isMissingShindigSchema(existingLikeError)) {
    throw existingLikeError;
  }

  if (existingLike) {
    const { error } = await client()
      .from('shindig_photo_likes')
      .delete()
      .eq('photo_id', args.photoId)
      .eq('user_id', args.userId);

    if (error) {
      throw error;
    }
  } else {
    const { error } = await client().from('shindig_photo_likes').insert({
      photo_id: args.photoId,
      user_id: args.userId,
    });

    if (error) {
      throw error;
    }
  }
}

export async function addPhotoComment(args: {
  body: string;
  photoId: string;
  userId: string;
}) {
  const { error } = await client().from('shindig_photo_comments').insert({
    body: args.body.trim(),
    photo_id: args.photoId,
    user_id: args.userId,
  });

  if (error) {
    throw error;
  }
}

export async function deletePhotoComment(args: {
  commentId: string;
  userId: string;
}) {
  const { error } = await client()
    .from('shindig_photo_comments')
    .delete()
    .eq('id', args.commentId)
    .eq('user_id', args.userId);

  if (error) {
    throw error;
  }
}

export async function getShindigById(args: {
  shindigId: string;
  userId: string;
}) {
  const { data, error } = await client()
    .from('shindigs')
    .select('id, title, created_at, user_id')
    .eq('id', args.shindigId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const rows = await hydrateShindigs({
    currentUserId: args.userId,
    shindigRows: [data as ShindigRow],
  });

  return rows[0] || null;
}

export async function createPhotoAddRequest(args: {
  photo: DraftStopPhoto;
  recipientUserId: string;
  requesterUserId: string;
  shindigId: string;
}) {
  const stopId = await getFirstStopIdForShindig(args.shindigId);
  const photoUrl = await uploadStopPhoto({
    photo: args.photo,
    shindigId: args.shindigId,
    stopId,
    userId: args.requesterUserId,
  });

  const { data, error } = await client()
    .from('shindig_photo_requests')
    .insert({
      photo_url: photoUrl,
      recipient_user_id: args.recipientUserId,
      requester_user_id: args.requesterUserId,
      shindig_id: args.shindigId,
      status: 'pending',
      stop_id: stopId,
    })
    .select(
      'id, shindig_id, stop_id, requester_user_id, recipient_user_id, photo_url, status, created_at'
    )
    .single();

  if (error && isMissingShindigSchema(error)) {
    throw new Error(
      'Your Supabase database is missing the photo request tables. Run the latest supabase/schema.sql first.'
    );
  }

  if (error || !data) {
    throw error || new Error('Failed to create photo request.');
  }

  return data as ShindigPhotoRequestRow;
}

export async function addPhotoToShindig(args: {
  photo: DraftStopPhoto;
  shindigId: string;
  userId: string;
}) {
  const stopId = await getFirstStopIdForShindig(args.shindigId);
  const photoUrl = await uploadStopPhoto({
    photo: args.photo,
    shindigId: args.shindigId,
    stopId,
    userId: args.userId,
  });

  const { data, error } = await client()
    .from('shindig_photos')
    .insert({
      contributor_user_id: null,
      photo_url: photoUrl,
      shindig_id: args.shindigId,
      stop_id: stopId,
    })
    .select('id, shindig_id, stop_id, photo_url, contributor_user_id')
    .single();

  if (error && isMissingShindigSchema(error)) {
    throw new Error(
      'Your Supabase database is missing the ShinDig photo tables. Run the latest supabase/schema.sql first.'
    );
  }

  if (error || !data) {
    throw error || new Error('Failed to add the photo to this ShinDig.');
  }

  return data as ShindigPhotoRow;
}

export async function approvePhotoAddRequest(args: {
  requestId: string;
  userId: string;
}) {
  const { data: requestRow, error: requestError } = await client()
    .from('shindig_photo_requests')
    .select(
      'id, shindig_id, stop_id, requester_user_id, recipient_user_id, photo_url, status, created_at'
    )
    .eq('id', args.requestId)
    .eq('recipient_user_id', args.userId)
    .maybeSingle();

  if (requestError) {
    throw requestError;
  }

  if (!requestRow) {
    throw new Error('That photo request could not be found.');
  }

  if (requestRow.status !== 'pending') {
    return requestRow as ShindigPhotoRequestRow;
  }

  const { error: photoError } = await client().from('shindig_photos').insert({
    contributor_user_id: requestRow.requester_user_id,
    photo_url: requestRow.photo_url,
    shindig_id: requestRow.shindig_id,
    stop_id: requestRow.stop_id,
  });

  if (photoError) {
    throw photoError;
  }

  const { data, error } = await client()
    .from('shindig_photo_requests')
    .update({ status: 'approved' })
    .eq('id', args.requestId)
    .select(
      'id, shindig_id, stop_id, requester_user_id, recipient_user_id, photo_url, status, created_at'
    )
    .single();

  if (error) {
    throw error;
  }

  return data as ShindigPhotoRequestRow;
}

export async function rejectPhotoAddRequest(args: {
  requestId: string;
  userId: string;
}) {
  const { data, error } = await client()
    .from('shindig_photo_requests')
    .update({ status: 'rejected' })
    .eq('id', args.requestId)
    .eq('recipient_user_id', args.userId)
    .select(
      'id, shindig_id, stop_id, requester_user_id, recipient_user_id, photo_url, status, created_at'
    )
    .single();

  if (error) {
    throw error;
  }

  return data as ShindigPhotoRequestRow;
}
