export interface PlatformCredentials {
  facebook?: {
    pageId: string;
    pageAccessToken: string;
  };
  instagram?: {
    businessAccountId: string;
    accessToken: string;
  };
  linkedin?: {
    accessToken: string;
    organizationId?: string; // optional, personal ya company
  };
  twitter?: {
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    accessTokenSecret: string;
  };
}

export interface PostPayload {
  caption: string;
  imageUrl?: string;
  platforms: string[];
  credentials: PlatformCredentials;
}

export interface PostResult {
  platform: string;
  success: boolean;
  postId?: string;
  error?: string;
}

// ─── FACEBOOK ───────────────────────────────────────────
async function postToFacebook(
  caption: string,
  imageUrl: string | undefined,
  creds: PlatformCredentials['facebook']
): Promise<PostResult> {
  if (!creds) return { platform: 'facebook', success: false, error: 'No credentials' };
  try {
    const endpoint = imageUrl
      ? `https://graph.facebook.com/v19.0/${creds.pageId}/photos`
      : `https://graph.facebook.com/v19.0/${creds.pageId}/feed`;

    const body: any = {
      access_token: creds.pageAccessToken,
      message: caption,
    };
    if (imageUrl) body.url = imageUrl;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json() as any;
    if (data.error) return { platform: 'facebook', success: false, error: data.error.message };
    return { platform: 'facebook', success: true, postId: data.id };
  } catch (e: any) {
    return { platform: 'facebook', success: false, error: e.message };
  }
}

// ─── INSTAGRAM ──────────────────────────────────────────
async function postToInstagram(
  caption: string,
  imageUrl: string | undefined,
  creds: PlatformCredentials['instagram']
): Promise<PostResult> {
  if (!creds) return { platform: 'instagram', success: false, error: 'No credentials' };
  if (!imageUrl) return { platform: 'instagram', success: false, error: 'Instagram requires an image' };
  try {
    // Step 1: Create media container
    const containerRes = await fetch(
      `https://graph.facebook.com/v19.0/${creds.businessAccountId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrl,
          caption,
          access_token: creds.accessToken,
        }),
      }
    );
    const container = await containerRes.json() as any;
    if (container.error) return { platform: 'instagram', success: false, error: container.error.message };

    // Step 2: Publish container
    const publishRes = await fetch(
      `https://graph.facebook.com/v19.0/${creds.businessAccountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: container.id,
          access_token: creds.accessToken,
        }),
      }
    );
    const published = await publishRes.json() as any;
    if (published.error) return { platform: 'instagram', success: false, error: published.error.message };
    return { platform: 'instagram', success: true, postId: published.id };
  } catch (e: any) {
    return { platform: 'instagram', success: false, error: e.message };
  }
}

// ─── LINKEDIN ───────────────────────────────────────────
async function postToLinkedIn(
  caption: string,
  imageUrl: string | undefined,
  creds: PlatformCredentials['linkedin']
): Promise<PostResult> {
  if (!creds) return { platform: 'linkedin', success: false, error: 'No credentials' };
  try {
    const author = creds.organizationId
      ? `urn:li:organization:${creds.organizationId}`
      : 'urn:li:person:me';

    const body: any = {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: caption },
          shareMediaCategory: imageUrl ? 'IMAGE' : 'NONE',
          ...(imageUrl && {
            media: [{
              status: 'READY',
              originalUrl: imageUrl,
            }],
          }),
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };

    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json() as any;
    if (res.status !== 201) return { platform: 'linkedin', success: false, error: JSON.stringify(data) };
    return { platform: 'linkedin', success: true, postId: data.id };
  } catch (e: any) {
    return { platform: 'linkedin', success: false, error: e.message };
  }
}

// ─── TWITTER/X ──────────────────────────────────────────
async function postToTwitter(
  caption: string,
  creds: PlatformCredentials['twitter']
): Promise<PostResult> {
  if (!creds) return { platform: 'twitter', success: false, error: 'No credentials' };
  try {
    // OAuth 1.0a signature
    const oauth = await buildOAuthHeader('POST', 'https://api.twitter.com/2/tweets', creds);
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': oauth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: caption }),
    });
    const data = await res.json() as any;
    if (data.errors) return { platform: 'twitter', success: false, error: data.errors[0]?.message };
    return { platform: 'twitter', success: true, postId: data.data?.id };
  } catch (e: any) {
    return { platform: 'twitter', success: false, error: e.message };
  }
}

// OAuth 1.0a helper for Twitter
async function buildOAuthHeader(
  method: string,
  url: string,
  creds: NonNullable<PlatformCredentials['twitter']>
): Promise<string> {
  const nonce = Math.random().toString(36).substring(2);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const params: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };

  const sortedParams = Object.keys(params).sort().map(k =>
    `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`
  ).join('&');

  const baseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
  const signingKey = `${encodeURIComponent(creds.apiSecret)}&${encodeURIComponent(creds.accessTokenSecret)}`;

  // HMAC-SHA1 using Web Crypto
  const keyData = new TextEncoder().encode(signingKey);
  const msgData = new TextEncoder().encode(baseString);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));

  params['oauth_signature'] = signature;

  const headerParams = Object.keys(params).sort().map(k =>
    `${encodeURIComponent(k)}="${encodeURIComponent(params[k])}"`
  ).join(', ');

  return `OAuth ${headerParams}`;
}

// ─── MAIN PUBLISHER ─────────────────────────────────────
export async function publishToAll(payload: PostPayload): Promise<PostResult[]> {
  const { caption, imageUrl, platforms, credentials } = payload;

  const tasks: Promise<PostResult>[] = [];

  if (platforms.includes('facebook') && credentials.facebook) {
    tasks.push(postToFacebook(caption, imageUrl, credentials.facebook));
  }
  if (platforms.includes('instagram') && credentials.instagram) {
    tasks.push(postToInstagram(caption, imageUrl, credentials.instagram));
  }
  if (platforms.includes('linkedin') && credentials.linkedin) {
    tasks.push(postToLinkedIn(caption, imageUrl, credentials.linkedin));
  }
  if (platforms.includes('twitter') && credentials.twitter) {
    tasks.push(postToTwitter(caption, credentials.twitter));
  }

  return Promise.all(tasks);
}