import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { publishToAll, type PostPayload } from '~/lib/social/publisher';

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { query } = await import('~/lib/db.server');
    const result = await query(
      'SELECT id, platform, account_name, is_active, created_at FROM social_accounts ORDER BY created_at DESC'
    );
    return json({ accounts: result.rows });
  } catch (e: any) {
    return json({ accounts: [], error: e.message });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { query } = await import('~/lib/db.server');
  const body = await request.json() as any;
  const { action } = body;

  if (action === 'save_account') {
    try {
      const { platform, accountName, credentials } = body;
      await query(
        `INSERT INTO social_accounts (platform, account_name, credentials)
         VALUES ($1, $2, $3)
         ON CONFLICT (platform) DO UPDATE
         SET account_name = $2, credentials = $3, is_active = true`,
        [platform, accountName, JSON.stringify(credentials)]
      );
      return json({ success: true });
    } catch (e: any) {
      return json({ success: false, error: e.message });
    }
  }

  if (action === 'publish') {
    try {
      const { caption, imageUrl, platforms } = body;
      const placeholders = platforms.map((_: any, i: number) => `$${i + 1}`).join(',');
      const result = await query(
        `SELECT platform, credentials FROM social_accounts WHERE platform IN (${placeholders}) AND is_active = true`,
        platforms
      );

      const credentials: any = {};
      for (const row of result.rows) {
        credentials[row.platform] = row.credentials;
      }

      const payload: PostPayload = { caption, imageUrl, platforms, credentials };
      const results = await publishToAll(payload);

      await query(
        'INSERT INTO social_posts (content, image_url, platforms, results) VALUES ($1, $2, $3, $4)',
        [caption, imageUrl || null, JSON.stringify(platforms), JSON.stringify(results)]
      );

      return json({ success: true, results });
    } catch (e: any) {
      return json({ success: false, error: e.message });
    }
  }

  if (action === 'generate_caption') {
    try {
      const { topic, tone, platforms } = body;
      const prompt = `Write a social media post about: "${topic}". 
Tone: ${tone}. 
Platforms: ${platforms.join(', ')}.
${platforms.includes('twitter') ? 'Keep it under 280 characters for Twitter.' : ''}
Return ONLY the caption text, no extra explanation.`;

      const providerName = (process.env.PROVIDER_NAME || 'openrouter').toLowerCase();
      const apiKey = process.env.PROVIDER_API_KEY || '';
      const model = process.env.DEFAULT_MODEL || 'gpt-3.5-turbo';

      let apiUrl = '';
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      };
      let bodyPayload: any = {};

      if (providerName === 'anthropic') {
        apiUrl = 'https://api.anthropic.com/v1/messages';
        headers = {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        };
        bodyPayload = { model, max_tokens: 500, messages: [{ role: 'user', content: prompt }] };
      } else if (providerName === 'openrouter') {
        apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
        bodyPayload = { model, max_tokens: 500, messages: [{ role: 'user', content: prompt }] };
      } else if (providerName === 'google') {
        apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        headers = { 'Content-Type': 'application/json' };
        bodyPayload = { contents: [{ parts: [{ text: prompt }] }] };
      } else {
        const baseUrl = process.env.PROVIDER_BASE_URL || 'https://api.openai.com/v1';
        apiUrl = `${baseUrl}/chat/completions`;
        bodyPayload = { model, max_tokens: 500, messages: [{ role: 'user', content: prompt }] };
      }

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json() as any;

      let caption = '';
      if (providerName === 'anthropic') {
        caption = data.content?.[0]?.text || '';
      } else if (providerName === 'google') {
        caption = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        caption = data.choices?.[0]?.message?.content || '';
      }

      if (!caption) {
        return json({ success: false, error: 'No caption generated: ' + JSON.stringify(data) });
      }

      return json({ success: true, caption });
    } catch (e: any) {
      return json({ success: false, error: e.message });
    }
  }

  if (action === 'generate_image') {
    try {
      const { prompt } = body;
      const apiKey = process.env.IMAGE_GEN_API_KEY || '';
      const baseUrl = process.env.IMAGE_GEN_BASE_URL || 'https://api.openai.com/v1';
      const model = process.env.IMAGE_GEN_MODEL || 'dall-e-3';

      if (!apiKey) {
        return json({ success: false, error: 'IMAGE_GEN_API_KEY not set in .env.local' });
      }

      const res = await fetch(`${baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024' }),
      });

      const data = await res.json() as any;

      if (data.error) {
        return json({ success: false, error: data.error.message || JSON.stringify(data.error) });
      }

      const imageUrl = data.data?.[0]?.url ||
        (data.data?.[0]?.b64_json
          ? `data:image/png;base64,${data.data[0].b64_json}`
          : null);

      if (!imageUrl) {
        return json({ success: false, error: 'No image returned from API' });
      }

      return json({ success: true, imageUrl });
    } catch (e: any) {
      return json({ success: false, error: e.message });
    }
  }

  return json({ success: false, error: 'Unknown action' });
}