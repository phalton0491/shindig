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

type RequestBody = {
  location?: string | null;
  prompt?: string;
  scheduledFor?: string | null;
  title?: string | null;
};

function buildPrompt(body: RequestBody) {
  const userPrompt = body.prompt?.trim();
  if (!userPrompt) {
    throw new Error('A prompt is required to generate a ShinDig cover.');
  }

  const titleText = body.title?.trim() ? `Event title: ${body.title?.trim()}.` : '';
  const locationText = body.location?.trim() ? `Location: ${body.location?.trim()}.` : '';
  const timeText = body.scheduledFor
    ? `Scheduled date and time: ${new Date(body.scheduledFor).toLocaleString('en-US', {
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
      })}.`
    : '';

  return [
    'Create a polished event cover image for the mobile app "ShinDig".',
    'Make it visually striking, cinematic, social, and suitable as a vertical event cover.',
    'Avoid text overlays, logos, watermarks, UI chrome, or collage layouts.',
    'Focus on one cohesive scene that feels aspirational and shareable.',
    titleText,
    locationText,
    timeText,
    `Creative direction: ${userPrompt}`,
  ]
    .filter(Boolean)
    .join(' ');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAiApiKey) {
    return jsonResponse(500, {
      error: 'OPENAI_API_KEY is not configured for this Supabase project.',
    });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const prompt = buildPrompt(body);

    const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.5',
        input: prompt,
        tools: [{ type: 'image_generation' }],
      }),
    });

    if (!openAiResponse.ok) {
      return jsonResponse(502, {
        details: await openAiResponse.text(),
        error: 'OpenAI image generation failed.',
      });
    }

    const payload = await openAiResponse.json();
    const imageResult = (payload.output || []).find(
      (item: { type?: string; result?: string }) =>
        item.type === 'image_generation_call' && typeof item.result === 'string'
    );

    if (!imageResult?.result) {
      return jsonResponse(502, { error: 'OpenAI did not return an image.' });
    }

    return jsonResponse(200, {
      base64: imageResult.result,
      mimeType: 'image/png',
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Cover generation failed.',
    });
  }
});
