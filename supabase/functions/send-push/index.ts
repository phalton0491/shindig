// @ts-nocheck

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: corsHeaders,
    status,
  });
}

type PushRequestBody = {
  body?: string;
  data?: Record<string, unknown>;
  recipientUserId?: string;
  title?: string;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Supabase service role is not configured.' });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse(401, { error: 'Missing authorization header.' });
  }

  const payload = (await request.json()) as PushRequestBody;
  if (!payload.recipientUserId || !payload.body) {
    return jsonResponse(400, { error: 'recipientUserId and body are required.' });
  }

  const tokenResponse = await fetch(`${supabaseUrl}/rest/v1/user_push_tokens?user_id=eq.${payload.recipientUserId}&select=expo_push_token`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!tokenResponse.ok) {
    return jsonResponse(500, { error: 'Failed to load push tokens.' });
  }

  const tokenRows = (await tokenResponse.json()) as { expo_push_token: string }[];
  const messages = tokenRows
    .map((row) => row.expo_push_token)
    .filter(Boolean)
    .map((token) => ({
      to: token,
      sound: 'default',
      title: payload.title || 'ShinDig',
      body: payload.body,
      data: payload.data || {},
    }));

  if (messages.length === 0) {
    return jsonResponse(200, { delivered: 0 });
  }

  const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    body: JSON.stringify(messages),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!expoResponse.ok) {
    return jsonResponse(502, { error: 'Expo push delivery failed.' });
  }

  return jsonResponse(200, {
    delivered: messages.length,
    result: await expoResponse.json(),
  });
});
