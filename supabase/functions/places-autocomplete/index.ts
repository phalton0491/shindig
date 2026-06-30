// @ts-nocheck

type Coordinates = {
  latitude: number;
  longitude: number;
};

type RequestBody = {
  localityHint?: string;
  near?: Coordinates;
  query?: string;
};

type AutocompleteSuggestion = {
  placePrediction?: {
    distanceMeters?: number;
    placeId?: string;
    text?: {
      text?: string;
    };
  };
};

type AutocompleteResponse = {
  suggestions?: AutocompleteSuggestion[];
};

type PlaceDetailsResponse = {
  displayName?: {
    text?: string;
  };
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  primaryType?: string;
};

const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  'https://places.googleapis.com/v1/places:autocomplete';
const GOOGLE_PLACES_DETAILS_URL = 'https://places.googleapis.com/v1/places';
const SEARCH_RADIUS_METERS = 12000;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
    status,
  });
}

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

function inferPlaceType(primaryType?: string) {
  const bucket = (primaryType || '').toLowerCase();
  if (bucket.includes('restaurant') || bucket.includes('food') || bucket.includes('cafe')) {
    return 'Restaurant';
  }
  if (bucket.includes('night_club') || bucket.includes('nightclub') || bucket.includes('club')) {
    return 'Club';
  }
  if (bucket.includes('bar') || bucket.includes('pub')) {
    return 'Bar';
  }

  return 'Place';
}

function inferVibeIds(primaryType?: string) {
  const bucket = (primaryType || '').toLowerCase();
  const vibeIds: string[] = [];

  if (bucket.includes('restaurant') || bucket.includes('food') || bucket.includes('cafe')) {
    vibeIds.push('restaurants');
  }
  if (bucket.includes('bar') || bucket.includes('pub')) {
    vibeIds.push('bars');
  }
  if (bucket.includes('night_club') || bucket.includes('nightclub') || bucket.includes('club')) {
    vibeIds.push('clubs');
  }

  return vibeIds.length > 0 ? vibeIds : ['bars', 'restaurants', 'clubs'];
}

async function fetchPlaceDetails(placeId: string, apiKey: string) {
  const response = await fetch(`${GOOGLE_PLACES_DETAILS_URL}/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'id,displayName,formattedAddress,location,primaryType',
    },
  });

  if (!response.ok) {
    throw new Error('Place details lookup failed.');
  }

  return (await response.json()) as PlaceDetailsResponse;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse(200, { ok: true });
  }

  const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!apiKey) {
    return jsonResponse(500, {
      error: 'GOOGLE_MAPS_API_KEY is not configured for this Supabase project.',
    });
  }

  const body = (await request.json()) as RequestBody;
  const query = body.query?.trim();

  if (!query) {
    return jsonResponse(200, []);
  }

  const autocompleteBody: Record<string, unknown> = {
    includeQueryPredictions: false,
    includedRegionCodes: ['US'],
    input: body.localityHint ? `${query} ${body.localityHint}` : query,
    regionCode: 'us',
  };

  if (body.near) {
    autocompleteBody.origin = {
      latitude: body.near.latitude,
      longitude: body.near.longitude,
    };
    autocompleteBody.locationBias = {
      circle: {
        center: {
          latitude: body.near.latitude,
          longitude: body.near.longitude,
        },
        radius: SEARCH_RADIUS_METERS,
      },
    };
  }

  const autocompleteResponse = await fetch(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
    body: JSON.stringify(autocompleteBody),
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.distanceMeters',
    },
    method: 'POST',
  });

  if (!autocompleteResponse.ok) {
    const errorText = await autocompleteResponse.text();
    return jsonResponse(500, {
      error: 'Google autocomplete failed.',
      details: errorText,
    });
  }

  const autocompleteJson = (await autocompleteResponse.json()) as AutocompleteResponse;
  const placePredictions = (autocompleteJson.suggestions || [])
    .map((suggestion) => suggestion.placePrediction)
    .filter((prediction): prediction is NonNullable<AutocompleteSuggestion['placePrediction']> =>
      Boolean(prediction?.placeId)
    )
    .slice(0, 5);

  const results = await Promise.all(
    placePredictions.map(async (prediction) => {
      const details = await fetchPlaceDetails(prediction.placeId!, apiKey);
      const latitude = details.location?.latitude ?? body.near?.latitude ?? 0;
      const longitude = details.location?.longitude ?? body.near?.longitude ?? 0;
      const distanceMiles =
        body.near && latitude && longitude
          ? distanceMilesBetween(body.near, { latitude, longitude })
          : prediction.distanceMeters
            ? prediction.distanceMeters / 1609.34
            : undefined;

      return {
        address: details.formattedAddress || prediction.text?.text || '',
        distanceMiles,
        durationLabel: '1 hr 30 min',
        id: `google-${prediction.placeId}`,
        latitude,
        longitude,
        title:
          details.displayName?.text ||
          prediction.text?.text?.split(',')[0] ||
          'Selected Place',
        transitMinutes: 10,
        transitMiles: Math.max(distanceMiles ?? 0.4, 0.2),
        type: inferPlaceType(details.primaryType),
        vibeIds: inferVibeIds(details.primaryType),
      };
    })
  );

  return jsonResponse(200, results);
});
