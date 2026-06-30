import { TimelinePlace } from '../types/models';
import { supabase } from './supabase';

type Coordinates = {
  latitude: number;
  longitude: number;
};

type NominatimPlace = {
  addresstype?: string;
  address?: {
    city?: string;
    county?: string;
    hamlet?: string;
    house_number?: string;
    municipality?: string;
    neighbourhood?: string;
    postcode?: string;
    road?: string;
    state?: string;
    suburb?: string;
    town?: string;
    village?: string;
  };
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  place_id: number;
  type?: string;
};

type OverpassElement = {
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: Record<string, string>;
  type: 'node' | 'way' | 'relation';
};

type OverpassResponse = {
  elements: OverpassElement[];
};

type PhotonFeature = {
  geometry: {
    coordinates: [number, number];
  };
  properties: {
    city?: string;
    country?: string;
    housenumber?: string;
    name?: string;
    osm_id?: number;
    osm_key?: string;
    osm_type?: string;
    osm_value?: string;
    state?: string;
    street?: string;
  };
};

type PhotonResponse = {
  features: PhotonFeature[];
};

const SEARCH_LIMIT = 3;
const MAX_NEARBY_DISTANCE_MILES = 12;
const SEARCH_TIMEOUT_MS = 1200;

let googleFunctionUnavailable = false;

function distanceMilesBetween(a: Coordinates, b: Coordinates) {
  const earthRadiusMiles = 3958.8;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return earthRadiusMiles * arc;
}

function inferTypeFromBucket(bucket: string) {
  if (
    bucket.includes('restaurant') ||
    bucket.includes('food') ||
    bucket.includes('cafe') ||
    bucket.includes('coffee')
  ) {
    return 'Restaurant';
  }
  if (bucket.includes('nightclub') || bucket.includes('club')) {
    return 'Club';
  }
  if (bucket.includes('bar') || bucket.includes('pub') || bucket.includes('bier')) {
    return 'Bar';
  }

  return 'Place';
}

function inferVibeIds(bucket: string) {
  const vibeIds: string[] = [];

  if (
    bucket.includes('restaurant') ||
    bucket.includes('food') ||
    bucket.includes('cafe') ||
    bucket.includes('coffee')
  ) {
    vibeIds.push('restaurants');
  }
  if (bucket.includes('bar') || bucket.includes('pub') || bucket.includes('bier')) {
    vibeIds.push('bars');
  }
  if (bucket.includes('nightclub') || bucket.includes('club') || bucket.includes('music')) {
    vibeIds.push('clubs');
  }

  return vibeIds.length > 0 ? vibeIds : ['bars', 'restaurants', 'clubs'];
}

function formatAddressParts(parts: Array<string | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(', ');
}

function isUnitedStatesCountry(value?: string) {
  const normalized = value?.trim().toLowerCase();
  return (
    normalized === 'united states' ||
    normalized === 'united states of america' ||
    normalized === 'usa' ||
    normalized === 'us'
  );
}

function formatNominatimAddress(result: NominatimPlace) {
  const address = result.address;
  if (!address) {
    return result.display_name;
  }

  const street = [address.house_number, address.road].filter(Boolean).join(' ').trim();
  const cityState = formatAddressParts([
    address.city ||
      address.town ||
      address.village ||
      address.hamlet ||
      address.suburb ||
      address.neighbourhood ||
      address.municipality ||
      address.county,
    address.state,
  ]);

  return [street, cityState].filter(Boolean).join(' | ') || result.display_name;
}

function mapNominatimResult(result: NominatimPlace, userLocation?: Coordinates): TimelinePlace {
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  const bucket = `${result.type || ''} ${result.addresstype || ''}`.toLowerCase();
  const distanceMiles = userLocation
    ? distanceMilesBetween(userLocation, { latitude, longitude })
    : undefined;

  return {
    address: formatNominatimAddress(result),
    distanceMiles,
    durationLabel: '1 hr 30 min',
    id: `nominatim-${result.place_id}`,
    latitude,
    longitude,
    title: result.name?.trim() || result.display_name.split(',')[0] || 'Selected Place',
    transitMinutes: 10,
    transitMiles: Math.max(distanceMiles ?? 0.4, 0.2),
    type: inferTypeFromBucket(bucket),
    vibeIds: inferVibeIds(bucket),
  };
}

function escapeRegex(query: string) {
  return query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getOverpassCoordinates(element: OverpassElement) {
  if (typeof element.lat === 'number' && typeof element.lon === 'number') {
    return { latitude: element.lat, longitude: element.lon };
  }
  if (element.center) {
    return { latitude: element.center.lat, longitude: element.center.lon };
  }

  return null;
}

function formatOverpassAddress(tags: Record<string, string>) {
  const street = [tags['addr:housenumber'], tags['addr:street']]
    .filter(Boolean)
    .join(' ')
    .trim();
  const cityState = formatAddressParts([
    tags['addr:city'] || tags['addr:town'] || tags['addr:suburb'] || tags['addr:neighbourhood'],
    tags['addr:state'],
  ]);

  return [street, cityState].filter(Boolean).join(' | ');
}

function mapOverpassElement(element: OverpassElement, userLocation: Coordinates): TimelinePlace | null {
  if (!element.tags?.name) {
    return null;
  }

  const coords = getOverpassCoordinates(element);
  if (!coords) {
    return null;
  }

  const bucket = `${element.tags.amenity || ''} ${element.tags.shop || ''} ${
    element.tags.tourism || ''
  } ${element.tags.leisure || ''}`.toLowerCase();
  const distanceMiles = distanceMilesBetween(userLocation, coords);

  return {
    address: formatOverpassAddress(element.tags) || 'Nearby place',
    distanceMiles,
    durationLabel: '1 hr 30 min',
    id: `overpass-${element.type}-${element.id}`,
    latitude: coords.latitude,
    longitude: coords.longitude,
    title: element.tags.name,
    transitMinutes: 10,
    transitMiles: Math.max(distanceMiles, 0.2),
    type: inferTypeFromBucket(bucket),
    vibeIds: inferVibeIds(bucket),
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Search timed out.'));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

async function searchFallbackGeocoder(args: {
  near?: Coordinates;
  localityHint?: string;
  query: string;
}) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', String(SEARCH_LIMIT));
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('countrycodes', 'us');
  url.searchParams.set('dedupe', '1');
  url.searchParams.set(
    'q',
    args.localityHint ? `${args.query} ${args.localityHint}` : args.query
  );

  if (args.near) {
    const delta = 0.08;
    url.searchParams.set(
      'viewbox',
      [
        args.near.longitude - delta,
        args.near.latitude + delta,
        args.near.longitude + delta,
        args.near.latitude - delta,
      ].join(',')
    );
  }

  const response = await fetch(url.toString(), {
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) {
    throw new Error('Location search failed.');
  }

  const json = (await response.json()) as NominatimPlace[];
  return json
    .map((result) => mapNominatimResult(result, args.near))
    .filter(
      (place) =>
        !args.near ||
        typeof place.distanceMiles !== 'number' ||
        place.distanceMiles <= MAX_NEARBY_DISTANCE_MILES
    )
    .sort((left, right) => {
      const leftDistance = left.distanceMiles ?? Number.MAX_SAFE_INTEGER;
      const rightDistance = right.distanceMiles ?? Number.MAX_SAFE_INTEGER;
      return leftDistance - rightDistance;
    })
    .slice(0, SEARCH_LIMIT);
}

function mapPhotonFeature(feature: PhotonFeature, userLocation?: Coordinates): TimelinePlace {
  const [longitude, latitude] = feature.geometry.coordinates;
  const bucket = `${feature.properties.osm_value || ''} ${feature.properties.osm_key || ''}`.toLowerCase();
  const distanceMiles = userLocation
    ? distanceMilesBetween(userLocation, { latitude, longitude })
    : undefined;
  const address = [
    [feature.properties.housenumber, feature.properties.street].filter(Boolean).join(' ').trim(),
    formatAddressParts([feature.properties.city, feature.properties.state]),
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    address: address || 'Nearby place',
    distanceMiles,
    durationLabel: '1 hr 30 min',
    id: `photon-${feature.properties.osm_type || 'item'}-${feature.properties.osm_id || feature.properties.name}`,
    latitude,
    longitude,
    title: feature.properties.name?.trim() || 'Selected Place',
    transitMinutes: 10,
    transitMiles: Math.max(distanceMiles ?? 0.4, 0.2),
    type: inferTypeFromBucket(bucket),
    vibeIds: inferVibeIds(bucket),
  };
}

async function searchPhoton(args: {
  near?: Coordinates;
  localityHint?: string;
  query: string;
}) {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set(
    'q',
    args.localityHint ? `${args.query} ${args.localityHint}` : args.query
  );
  url.searchParams.set('limit', String(SEARCH_LIMIT));

  if (args.near) {
    url.searchParams.set('lat', String(args.near.latitude));
    url.searchParams.set('lon', String(args.near.longitude));
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('Autocomplete search failed.');
  }

  const json = (await response.json()) as PhotonResponse;
  return json.features
    .filter((feature) => isUnitedStatesCountry(feature.properties.country))
    .map((feature) => mapPhotonFeature(feature, args.near))
    .filter(
      (place) =>
        !args.near ||
        typeof place.distanceMiles !== 'number' ||
        place.distanceMiles <= MAX_NEARBY_DISTANCE_MILES
    )
    .sort((left, right) => {
      const leftDistance = left.distanceMiles ?? Number.MAX_SAFE_INTEGER;
      const rightDistance = right.distanceMiles ?? Number.MAX_SAFE_INTEGER;
      return leftDistance - rightDistance;
    })
    .slice(0, SEARCH_LIMIT);
}

export async function searchPlaces(args: {
  near?: Coordinates;
  localityHint?: string;
  mode?: 'instant' | 'submit';
  query: string;
}): Promise<TimelinePlace[]> {
  const normalizedQuery = args.query.trim();
  if (!normalizedQuery) {
    return [];
  }

  if (supabase && !googleFunctionUnavailable) {
    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke('places-autocomplete', {
          body: {
            localityHint: args.localityHint,
            near: args.near,
            query: normalizedQuery,
          },
        }),
        SEARCH_TIMEOUT_MS
      );

      if (!error && Array.isArray(data) && data.length > 0) {
        return data as TimelinePlace[];
      }
    } catch {
      googleFunctionUnavailable = true;
    }
  }

  try {
    const photonResults = await withTimeout(searchPhoton(args), SEARCH_TIMEOUT_MS);
    if (photonResults.length > 0) {
      return photonResults;
    }
  } catch {
    // Fall back to the geocoder below.
  }

  try {
    return await withTimeout(searchFallbackGeocoder(args), SEARCH_TIMEOUT_MS);
  } catch {
    return [];
  }
}
