import { SavedShindig, SavedShindigPhoto, SavedShindigStop, TimelinePlace } from '../types/models';
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
  id: string;
  photo_url: string;
  shindig_id: string;
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

function buildShindigTitle(stops: CreateShindigStopInput[]) {
  if (stops.length === 0) {
    return 'ShinDig';
  }
  if (stops.length === 1) {
    return stops[0].place.title;
  }

  return `${stops[0].place.title} + ${stops.length - 1} more`;
}

function mapShindigs(rows: {
  photos: ShindigPhotoRow[];
  shindigs: ShindigRow[];
  stops: ShindigStopRow[];
}): SavedShindig[] {
  return rows.shindigs.map((shindig) => {
    const stops = rows.stops
      .filter((stop) => stop.shindig_id === shindig.id)
      .sort((left, right) => left.stop_order - right.stop_order)
      .map((stop) => {
        const photos = rows.photos
          .filter((photo) => photo.stop_id === stop.id)
          .map<SavedShindigPhoto>((photo) => ({
            id: photo.id,
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
      coverPhotoUrl: photos[0]?.photoUrl || null,
      createdAt: shindig.created_at,
      id: shindig.id,
      photoCount: photos.length,
      stops,
      title: shindig.title,
    } satisfies SavedShindig;
  });
}

export async function listShindigsForUser(userId: string) {
  const [{ data: shindigs, error: shindigsError }, { data: stops, error: stopsError }, { data: photos, error: photosError }] =
    await Promise.all([
      client()
        .from('shindigs')
        .select('id, title, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      client()
        .from('shindig_stops')
        .select(
          'id, shindig_id, stop_order, title, place_type, address, latitude, longitude, transit_minutes, transit_miles, scheduled_time'
        )
        .order('stop_order', { ascending: true }),
      client().from('shindig_photos').select('id, shindig_id, stop_id, photo_url'),
    ]);

  if (shindigsError && isMissingShindigSchema(shindigsError)) {
    return [];
  }
  if (stopsError && isMissingShindigSchema(stopsError)) {
    return [];
  }
  if (photosError && isMissingShindigSchema(photosError)) {
    return [];
  }

  if (shindigsError) {
    throw shindigsError;
  }
  if (stopsError) {
    throw stopsError;
  }
  if (photosError) {
    throw photosError;
  }

  return mapShindigs({
    photos: (photos || []) as ShindigPhotoRow[],
    shindigs: (shindigs || []) as ShindigRow[],
    stops: (stops || []) as ShindigStopRow[],
  });
}

export async function createShindig(args: {
  stops: CreateShindigStopInput[];
  userId: string;
}) {
  if (args.stops.length === 0) {
    throw new Error('Add at least one stop before saving a ShinDig.');
  }

  const { data: shindigData, error: shindigError } = await client()
    .from('shindigs')
    .insert({
      title: buildShindigTitle(args.stops),
      user_id: args.userId,
    })
    .select('id, title, created_at')
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
          photo_url: photoUrl,
          shindig_id: shindigData.id,
          stop_id: matchingStop.id,
        })
        .select('id, shindig_id, stop_id, photo_url')
        .single();

      if (photoError || !savedPhoto) {
        throw photoError || new Error('Failed to save shindig photo.');
      }

      photoRows.push(savedPhoto as ShindigPhotoRow);
    }
  }

  return mapShindigs({
    photos: photoRows,
    shindigs: [shindigData as ShindigRow],
    stops: stopRows as ShindigStopRow[],
  })[0];
}
