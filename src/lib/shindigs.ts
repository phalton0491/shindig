import {
  FeedComment,
  FeedShindig,
  SavedShindig,
  SavedShindigPhoto,
  SavedShindigStop,
  ShindigState,
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
  cover_photo_url?: string | null;
  created_at: string;
  id: string;
  state: ShindigState;
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
  created_at: string;
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

type ShindigInviteRow = {
  created_at: string;
  id: string;
  invite_token: string | null;
  invitee_user_id: string | null;
  inviter_user_id: string;
  phone_number: string | null;
  shindig_id: string;
  status: 'accepted' | 'pending' | 'rejected';
};

const SHINDIG_PHOTOS_BUCKET = 'shindig-photos';

function createInviteToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function isMissingShindigSchema(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === '42P01' ||
    candidate.code === '42703' ||
    candidate.message?.toLowerCase().includes('relation') === true ||
    candidate.message?.toLowerCase().includes('column') === true ||
    candidate.message?.toLowerCase().includes('does not exist') === true
  );
}

const SHINDIG_SELECT_COLUMNS =
  'id, title, created_at, user_id, state, cover_photo_url';
const SHINDIG_SELECT_COLUMNS_FALLBACK = 'id, title, created_at, user_id, state';

async function runShindigSelect<T>(buildQuery: (columns: string) => any) {
  const withCover = await buildQuery(SHINDIG_SELECT_COLUMNS);
  if (!withCover.error) {
    return withCover as { data: T[] | T | null; error: null };
  }

  if (!isMissingShindigSchema(withCover.error)) {
    return withCover;
  }

  const fallback = await buildQuery(SHINDIG_SELECT_COLUMNS_FALLBACK);
  if (!fallback.error && fallback.data) {
    if (Array.isArray(fallback.data)) {
      return {
        data: fallback.data.map((row: any) => ({ ...row, cover_photo_url: null })) as T[],
        error: null,
      };
    }

    return {
      data: { ...(fallback.data as object), cover_photo_url: null } as T,
      error: null,
    };
  }

  return fallback;
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

async function ensureShindigActive(shindigId: string) {
  const { data, error } = await client()
    .from('shindigs')
    .select('state')
    .eq('id', shindigId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('That ShinDig could not be found.');
  }

  if ((data.state as ShindigState) !== 'active') {
    throw new Error('This ShinDig is completed. Reactivate it before adding more photos.');
  }
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

function sortPhotosNewestFirst<T extends { createdAt: string }>(photos: T[]) {
  return [...photos].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
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
  invitedByUserIdByShindigId?: Map<string, string>;
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
            createdAt: photo.created_at,
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

    const photos = sortPhotosNewestFirst(stops.flatMap((stop) => stop.photos));
    const selectedCoverPhoto = shindig.cover_photo_url
      ? photos.find((photo) => photo.photoUrl === shindig.cover_photo_url) || null
      : null;

    return {
      comments: shindigComments,
      coverPhotoPhotoId: selectedCoverPhoto?.id || null,
      coverPhotoUrl: selectedCoverPhoto?.photoUrl || photos[0]?.photoUrl || null,
      createdAt: shindig.created_at,
      id: shindig.id,
      invitedBy: args.invitedByUserIdByShindigId?.get(shindig.id)
        ? args.profilesById.get(args.invitedByUserIdByShindigId.get(shindig.id)!)
        : undefined,
      likeCount: shindigLikes.length,
      likedByMe: shindigLikes.some((like) => like.user_id === args.currentUserId),
      ownerId: shindig.user_id,
      photoCount: photos.length,
      state: shindig.state,
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
        .select('id, shindig_id, stop_id, photo_url, contributor_user_id, created_at')
        .in('shindig_id', shindigIds)
        .order('created_at', { ascending: false }),
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
  invitedByUserIdByShindigId?: Map<string, string>;
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
    invitedByUserIdByShindigId: args.invitedByUserIdByShindigId,
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

export async function listShindigsForUser(
  userId: string,
  options?: { includeAcceptedInvites?: boolean }
) {
  const { data: ownedShindigs, error: shindigsError } = await runShindigSelect<ShindigRow[]>(
    (columns) =>
      client()
        .from('shindigs')
        .select(columns)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
  );

  if (shindigsError && isMissingShindigSchema(shindigsError)) {
    return [];
  }
  if (shindigsError) {
    throw shindigsError;
  }

  const shindigRows = (ownedShindigs || []) as ShindigRow[];
  let acceptedInviteRows: ShindigInviteRow[] = [];

  if (options?.includeAcceptedInvites) {
    const { data: inviteRows, error: inviteRowsError } = await client()
      .from('shindig_invites')
      .select(
        'id, shindig_id, inviter_user_id, invitee_user_id, phone_number, invite_token, status, created_at'
      )
      .eq('invitee_user_id', userId)
      .eq('status', 'accepted');

    if (inviteRowsError && !isMissingShindigSchema(inviteRowsError)) {
      throw inviteRowsError;
    }

    acceptedInviteRows = (inviteRows || []) as ShindigInviteRow[];

    if (acceptedInviteRows.length > 0) {
      const { data: invitedRows, error: invitedRowsError } = await client()
        .from('shindigs')
        .select(SHINDIG_SELECT_COLUMNS)
        .in('id', acceptedInviteRows.map((row) => row.shindig_id))
        .order('created_at', { ascending: false });

      if (invitedRowsError && isMissingShindigSchema(invitedRowsError)) {
        const fallback = await client()
          .from('shindigs')
          .select(SHINDIG_SELECT_COLUMNS_FALLBACK)
          .in('id', acceptedInviteRows.map((row) => row.shindig_id))
          .order('created_at', { ascending: false });
        if (fallback.error && !isMissingShindigSchema(fallback.error)) {
          throw fallback.error;
        }
        shindigRows.push(
          ...(((fallback.data || []) as ShindigRow[]).map((row) => ({
            ...row,
            cover_photo_url: null,
          })))
        );
      } else {
        if (invitedRowsError && !isMissingShindigSchema(invitedRowsError)) {
          throw invitedRowsError;
        }

        shindigRows.push(...((invitedRows || []) as ShindigRow[]));
      }
    }
  }

  const uniqueShindigRows = Array.from(new Map(shindigRows.map((row) => [row.id, row])).values());
  return hydrateShindigs({
    currentUserId: userId,
    invitedByUserIdByShindigId: new Map(
      acceptedInviteRows.map((row) => [row.shindig_id, row.inviter_user_id])
    ),
    shindigRows: uniqueShindigRows,
  });
}

export async function listFeedShindigs(args: {
  friendIds: string[];
  userId: string;
}) {
  const ownerIds = Array.from(new Set([args.userId, ...args.friendIds]));
  const [ownedAndFriendRows, acceptedInviteRows] = await Promise.all([
    runShindigSelect<ShindigRow[]>((columns) =>
      client()
        .from('shindigs')
        .select(columns)
        .in('user_id', ownerIds)
        .order('created_at', { ascending: false })
    ),
    client()
      .from('shindig_invites')
      .select('shindig_id')
      .eq('invitee_user_id', args.userId)
      .eq('status', 'accepted'),
  ]);

  const { data: shindigs, error: shindigsError } = ownedAndFriendRows;

  if (shindigsError && isMissingShindigSchema(shindigsError)) {
    return [];
  }
  if (shindigsError) {
    throw shindigsError;
  }
  if (acceptedInviteRows.error && !isMissingShindigSchema(acceptedInviteRows.error)) {
    throw acceptedInviteRows.error;
  }

  const acceptedInviteIds = ((acceptedInviteRows.data || []) as { shindig_id: string }[]).map(
    (row) => row.shindig_id
  );
  let invitedShindigRows: ShindigRow[] = [];

  if (acceptedInviteIds.length > 0) {
    const { data: invitedRows, error: invitedRowsError } = await runShindigSelect<ShindigRow[]>(
      (columns) =>
        client()
          .from('shindigs')
          .select(columns)
          .in('id', acceptedInviteIds)
          .order('created_at', { ascending: false })
    );

    if (invitedRowsError && !isMissingShindigSchema(invitedRowsError)) {
      throw invitedRowsError;
    }

    invitedShindigRows = (invitedRows || []) as ShindigRow[];
  }

  const shindigRows = Array.from(
    new Map(
      [...((shindigs || []) as ShindigRow[]), ...invitedShindigRows].map((row) => [row.id, row])
    ).values()
  );
  const savedShindigs = await hydrateShindigs({
    currentUserId: args.userId,
    shindigRows,
  });
  const ownerProfiles = await getFriendProfilesByIds(
    Array.from(new Set(shindigRows.map((row) => row.user_id)))
  );
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
      state: 'active',
      title: buildShindigTitle({ providedTitle: args.title, stops: args.stops }),
      user_id: args.userId,
    })
    .select(SHINDIG_SELECT_COLUMNS_FALLBACK)
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
        .select('id, shindig_id, stop_id, photo_url, contributor_user_id, created_at')
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

export async function listPhotoLikeProfiles(photoId: string) {
  const { data, error } = await client()
    .from('shindig_photo_likes')
    .select('user_id')
    .eq('photo_id', photoId);

  if (error) {
    throw error;
  }

  const likerIds = Array.from(
    new Set(((data || []) as { user_id: string }[]).map((row) => row.user_id).filter(Boolean))
  );

  if (likerIds.length === 0) {
    return [];
  }

  return getFriendProfilesByIds(likerIds);
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
    .select(SHINDIG_SELECT_COLUMNS)
    .eq('id', args.shindigId)
    .maybeSingle();

  if (error && isMissingShindigSchema(error)) {
    const fallback = await client()
      .from('shindigs')
      .select(SHINDIG_SELECT_COLUMNS_FALLBACK)
      .eq('id', args.shindigId)
      .maybeSingle();

    if (fallback.error) {
      throw fallback.error;
    }

    if (!fallback.data) {
      return null;
    }

    const rows = await hydrateShindigs({
      currentUserId: args.userId,
      shindigRows: [{ ...(fallback.data as ShindigRow), cover_photo_url: null }],
    });

    return rows[0] || null;
  }

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

export async function createAppFriendShindigInvites(args: {
  friendIds: string[];
  inviterUserId: string;
  shindigId: string;
}) {
  const uniqueFriendIds = Array.from(
    new Set(args.friendIds.filter((friendId) => friendId && friendId !== args.inviterUserId))
  );

  if (uniqueFriendIds.length === 0) {
    return [] as ShindigInviteRow[];
  }

  const { data: existingRows, error: existingRowsError } = await client()
    .from('shindig_invites')
    .select(
      'id, shindig_id, inviter_user_id, invitee_user_id, phone_number, invite_token, status, created_at'
    )
    .eq('shindig_id', args.shindigId)
    .in('invitee_user_id', uniqueFriendIds);

  if (existingRowsError && isMissingShindigSchema(existingRowsError)) {
    throw new Error(
      'Your Supabase database is missing the ShinDig invite tables. Run the latest supabase/schema.sql first.'
    );
  }

  if (existingRowsError) {
    throw existingRowsError;
  }

  const existingByInviteeId = new Map(
    ((existingRows || []) as ShindigInviteRow[])
      .filter((row) => row.invitee_user_id)
      .map((row) => [row.invitee_user_id!, row])
  );
  const invites: ShindigInviteRow[] = [];

  for (const friendId of uniqueFriendIds) {
    const existingInvite = existingByInviteeId.get(friendId);
    if (existingInvite) {
      if (existingInvite.status === 'rejected') {
        const { data: updatedRow, error: updateError } = await client()
          .from('shindig_invites')
          .update({ status: 'pending' })
          .eq('id', existingInvite.id)
          .select(
            'id, shindig_id, inviter_user_id, invitee_user_id, phone_number, invite_token, status, created_at'
          )
          .single();

        if (updateError || !updatedRow) {
          throw updateError || new Error('Failed to refresh that ShinDig invite.');
        }

        invites.push(updatedRow as ShindigInviteRow);
      } else {
        invites.push(existingInvite);
      }
      continue;
    }

    const { data: createdRow, error: createError } = await client()
      .from('shindig_invites')
      .insert({
        invitee_user_id: friendId,
        inviter_user_id: args.inviterUserId,
        shindig_id: args.shindigId,
        status: 'pending',
      })
      .select(
        'id, shindig_id, inviter_user_id, invitee_user_id, phone_number, invite_token, status, created_at'
      )
      .single();

    if (createError || !createdRow) {
      throw createError || new Error('Failed to create that ShinDig invite.');
    }

    invites.push(createdRow as ShindigInviteRow);
  }

  return invites;
}

export async function createPhoneShindigInvite(args: {
  inviterUserId: string;
  shindigId: string;
}) {
  const inviteToken = createInviteToken();
  const { data, error } = await client()
    .from('shindig_invites')
    .insert({
      invite_token: inviteToken,
      inviter_user_id: args.inviterUserId,
      shindig_id: args.shindigId,
      status: 'pending',
    })
    .select(
      'id, shindig_id, inviter_user_id, invitee_user_id, phone_number, invite_token, status, created_at'
    )
    .single();

  if (error && isMissingShindigSchema(error)) {
    throw new Error(
      'Your Supabase database is missing the ShinDig invite tables. Run the latest supabase/schema.sql first.'
    );
  }

  if (error || !data) {
    throw error || new Error('Failed to create the text-message invite.');
  }

  return data as ShindigInviteRow;
}

export async function claimShindigInvite(args: { inviteToken: string }) {
  const { data, error } = await client().rpc('claim_shindig_invite', {
    invite_token_input: args.inviteToken,
  });

  if (error) {
    throw error;
  }

  return data as ShindigInviteRow;
}

export async function acceptShindigInvite(args: {
  inviteId: string;
  userId: string;
}) {
  const { data, error } = await client()
    .from('shindig_invites')
    .update({ status: 'accepted' })
    .eq('id', args.inviteId)
    .eq('invitee_user_id', args.userId)
    .select(
      'id, shindig_id, inviter_user_id, invitee_user_id, phone_number, invite_token, status, created_at'
    )
    .single();

  if (error || !data) {
    throw error || new Error('That ShinDig invite could not be accepted.');
  }

  return data as ShindigInviteRow;
}

export async function rejectShindigInvite(args: {
  inviteId: string;
  userId: string;
}) {
  const { data, error } = await client()
    .from('shindig_invites')
    .update({ status: 'rejected' })
    .eq('id', args.inviteId)
    .eq('invitee_user_id', args.userId)
    .select(
      'id, shindig_id, inviter_user_id, invitee_user_id, phone_number, invite_token, status, created_at'
    )
    .single();

  if (error || !data) {
    throw error || new Error('That ShinDig invite could not be rejected.');
  }

  return data as ShindigInviteRow;
}

export async function createPhotoAddRequest(args: {
  photo: DraftStopPhoto;
  recipientUserId: string;
  requesterUserId: string;
  shindigId: string;
}) {
  await ensureShindigActive(args.shindigId);
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
  await ensureShindigActive(args.shindigId);
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
      contributor_user_id: args.userId,
      photo_url: photoUrl,
      shindig_id: args.shindigId,
      stop_id: stopId,
    })
    .select('id, shindig_id, stop_id, photo_url, contributor_user_id, created_at')
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

  await ensureShindigActive(requestRow.shindig_id);

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

export async function updateShindigState(args: {
  shindigId: string;
  state: ShindigState;
  userId: string;
}) {
  const { error } = await client()
    .from('shindigs')
    .update({ state: args.state })
    .eq('id', args.shindigId)
    .eq('user_id', args.userId);

  if (error && isMissingShindigSchema(error)) {
    throw new Error(
      'Your Supabase database is missing the ShinDig state column. Run the latest supabase/schema.sql first.'
    );
  }

  if (error) {
    throw error;
  }

  const updated = await getShindigById({
    shindigId: args.shindigId,
    userId: args.userId,
  });

  if (!updated) {
    throw new Error('That ShinDig could not be reloaded after updating its state.');
  }

  return updated;
}

export async function updateShindigCoverPhoto(args: {
  photoId: string;
  shindigId: string;
  userId: string;
}) {
  const { data: photoRow, error: photoError } = await client()
    .from('shindig_photos')
    .select('id, photo_url, shindig_id')
    .eq('id', args.photoId)
    .eq('shindig_id', args.shindigId)
    .maybeSingle();

  if (photoError) {
    throw photoError;
  }

  if (!photoRow) {
    throw new Error('That photo could not be found for this ShinDig.');
  }

  const { error } = await client()
    .from('shindigs')
    .update({ cover_photo_url: photoRow.photo_url })
    .eq('id', args.shindigId)
    .eq('user_id', args.userId);

  if (error && isMissingShindigSchema(error)) {
    throw new Error(
      'Your Supabase database is missing the ShinDig cover photo column. Run the latest supabase/schema.sql first.'
    );
  }

  if (error) {
    throw error;
  }

  const updated = await getShindigById({
    shindigId: args.shindigId,
    userId: args.userId,
  });

  if (!updated) {
    throw new Error('That ShinDig could not be reloaded after updating the cover photo.');
  }

  return updated;
}

export async function deleteShindig(args: {
  shindigId: string;
  userId: string;
}) {
  const { data: stopRows, error: stopsError } = await client()
    .from('shindig_stops')
    .select('id')
    .eq('shindig_id', args.shindigId);

  if (stopsError && !isMissingShindigSchema(stopsError)) {
    throw stopsError;
  }

  for (const stop of ((stopRows || []) as { id: string }[])) {
    const folderPrefix = `${args.userId}/${args.shindigId}/${stop.id}`;
    const { data: files, error: listError } = await client().storage
      .from(SHINDIG_PHOTOS_BUCKET)
      .list(folderPrefix);

    if (listError) {
      continue;
    }

    const paths = (files || [])
      .filter((file) => file.name)
      .map((file) => `${folderPrefix}/${file.name}`);

    if (paths.length > 0) {
      await client().storage.from(SHINDIG_PHOTOS_BUCKET).remove(paths);
    }
  }

  const { error } = await client()
    .from('shindigs')
    .delete()
    .eq('id', args.shindigId)
    .eq('user_id', args.userId);

  if (error) {
    throw error;
  }
}

export async function deletePhotoFromShindig(args: {
  photoId: string;
  shindigId: string;
  userId: string;
}) {
  const { data: photoRow, error: photoError } = await client()
    .from('shindig_photos')
    .select('id, photo_url, shindig_id, contributor_user_id')
    .eq('id', args.photoId)
    .eq('shindig_id', args.shindigId)
    .maybeSingle();

  if (photoError) {
    throw photoError;
  }

  if (!photoRow) {
    throw new Error('That photo could not be found.');
  }

  const { error } = await client()
    .from('shindig_photos')
    .delete()
    .eq('id', args.photoId)
    .eq('shindig_id', args.shindigId);

  if (error) {
    throw error;
  }

  const updated = await getShindigById({
    shindigId: args.shindigId,
    userId: args.userId,
  });

  return updated;
}
