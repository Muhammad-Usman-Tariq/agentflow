import type { AgentInput, AgentOutput, AgentConfig, IAgent } from '../types/agent.types';

interface ProviderConfig {
  name: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export abstract class AgentBase implements IAgent {
  config: AgentConfig;
  protected env: Record<string, string> = {};

  constructor(config: AgentConfig, env?: Record<string, string>) {
    this.config = config;
    this.env = env || {};
  }

  abstract execute(input: AgentInput): Promise<AgentOutput>;

  async run(input: AgentInput): Promise<AgentOutput> {
    let attempt = 0;

    while (attempt < this.config.maxRetries) {
      attempt++;
      console.log(`[${this.config.name}] Attempt ${attempt}/${this.config.maxRetries}`);

      try {
        const result = await this.withTimeout(
          this.execute(input),
          this.config.timeoutMs
        );
        console.log(`[${this.config.name}] ✅ Success on attempt ${attempt}`);
        return result;

      } catch (error: any) {
        console.error(`[${this.config.name}] ❌ Attempt ${attempt} failed:`, error.message);

        if (attempt >= this.config.maxRetries) {
          return {
            success: false,
            agentName: this.config.name,
            data: null,
            error: `Failed after ${attempt} attempts: ${error.message}`,
          };
        }

        const waitMs = 1000 * attempt;
        console.log(`[${this.config.name}] Waiting ${waitMs}ms before retry...`);
        await this.sleep(waitMs);
      }
    }

    return {
      success: false,
      agentName: this.config.name,
      data: null,
      error: 'Unknown error',
    };
  }

  protected async callLLM(
    systemPrompt: string,
    userMessage: string,
    expectJson: boolean = false
  ): Promise<string> {
    const providers = this.buildProviderList();

    if (providers.length === 0) {
      throw new Error('No providers configured. Please set PROVIDER_NAME and PROVIDER_API_KEY.');
    }

    let lastError = '';

    for (const provider of providers) {
      try {
        console.log(`[${this.config.name}] Trying: ${provider.name} / ${provider.model}`);
        const text = await this.callProvider(provider, systemPrompt, userMessage);

        if (text) {
          console.log(`[${this.config.name}] ✅ Success with: ${provider.name}`);
          return expectJson ? this.extractJson(text) : text;
        }

      } catch (error: any) {
        lastError = error.message;
        console.warn(`[${this.config.name}] ⚠️ ${provider.name} failed: ${error.message}`);
        console.log(`[${this.config.name}] → Trying next provider...`);
      }
    }

    throw new Error(`All providers failed. Last error: ${lastError}`);
  }

  private buildProviderList(): ProviderConfig[] {
    const providers: ProviderConfig[] = [];
    const e = this.env;

    const name = e.PROVIDER_NAME || process.env.PROVIDER_NAME;
    const apiKey = e.PROVIDER_API_KEY || process.env.PROVIDER_API_KEY;
    const model = e.DEFAULT_MODEL || process.env.DEFAULT_MODEL || '';
    // ⚠️ FIX: this used to only check PROVIDER_BASE_URL, which was never the
    // actual configured variable name — the app-wide convention (used by
    // OpenAILikeProvider elsewhere) is OPENAI_LIKE_API_BASE_URL. Because this
    // always read as undefined, callProvider() fell through to
    // autoDetectBaseUrl('openailike'), which isn't in its known-providers map
    // either, so it silently defaulted to the REAL OpenAI API — sending our
    // local Colab API key there and getting a 401.
    const baseUrl =
      e.OPENAI_LIKE_API_BASE_URL || process.env.OPENAI_LIKE_API_BASE_URL ||
      e.PROVIDER_BASE_URL || process.env.PROVIDER_BASE_URL;

    if (name && apiKey) {
      providers.push({
        name: name.toLowerCase(),
        apiKey,
        model,
        baseUrl,
      });
    }

    for (let i = 1; i <= 3; i++) {
      const fname = e[`FALLBACK_${i}_NAME`] || process.env[`FALLBACK_${i}_NAME`];
      const fapiKey = e[`FALLBACK_${i}_API_KEY`] || process.env[`FALLBACK_${i}_API_KEY`];
      const fmodel = e[`FALLBACK_${i}_MODEL`] || process.env[`FALLBACK_${i}_MODEL`];
      const fbaseUrl = e[`FALLBACK_${i}_BASE_URL`] || process.env[`FALLBACK_${i}_BASE_URL`];

      if (fname && fapiKey && fmodel) {
        providers.push({
          name: fname.toLowerCase(),
          apiKey: fapiKey,
          model: fmodel,
          baseUrl: fbaseUrl,
        });
      }
    }

    return providers;
  }

  private async callProvider(
    provider: ProviderConfig,
    systemPrompt: string,
    userMessage: string
  ): Promise<string> {
    const { name, apiKey, model, baseUrl } = provider;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    // ⚠️ FIX: was hardcoded to 8000 everywhere, ignoring MAX_COMPLETION_TOKENS
    // — the same env var stream-text.ts already reads for the main chat path.
    // This is the reason the coder agent kept truncating: a self-hosted small
    // model needs a different budget than a fast cloud API, and there was no
    // way to configure it without editing code. Now it follows the same
    // .env-driven convention as the rest of the app.
    const envMaxTokens = this.env?.MAX_COMPLETION_TOKENS
      ? parseInt(this.env.MAX_COMPLETION_TOKENS, 10)
      : (process.env.MAX_COMPLETION_TOKENS ? parseInt(process.env.MAX_COMPLETION_TOKENS, 10) : NaN);
    const maxTokens = Number.isFinite(envMaxTokens) && envMaxTokens > 0 ? envMaxTokens : 8000;

    let apiUrl = '';
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
    let bodyPayload: any = {};
    // ⚠️ FIX: Cloudflare (non-Enterprise plans) hard-kills any proxied,
    // NON-STREAMING HTTP request/response after ~100 seconds with a 524
    // error — regardless of any timeoutMs we configure in our own JS code.
    // Our self-hosted Kaggle/Qwen backend regularly takes longer than that
    // for a single call. Streaming (SSE) responses aren't subject to the
    // same hard cutoff as long as data keeps flowing, so OpenAI-compatible
    // calls (our own backend, Groq, OpenRouter, etc.) now request
    // stream: true and are parsed as SSE, same as the main /api/chat path
    // already does. This directly fixes the ARCHITECT/CODER/etc. "524:
    // error code: 524" failures.
    let isStreamingRequest = false;

    if (name === 'anthropic') {
      apiUrl = 'https://api.anthropic.com/v1/messages';
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      };
      bodyPayload = {
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      };
    } else if (name === 'google') {
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      headers = { 'Content-Type': 'application/json' };
      bodyPayload = {
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }],
      };
    } else {
      const detectedUrl = baseUrl || this.autoDetectBaseUrl(name);
      apiUrl = `${detectedUrl}/chat/completions`;
      bodyPayload = { model, max_tokens: maxTokens, messages, stream: true };
      isStreamingRequest = true;
    }

    // ⚠️ FIX: previously, when AgentBase.run()'s outer timeout fired, we
    // simply stopped WAITING for this fetch — we never actually cancelled
    // it. The request kept running on the (single, shared) Colab GPU in
    // the background, and the very next retry fired a BRAND NEW request on
    // top of it. Each retry stacked more concurrent load onto the same
    // GPU, making every subsequent attempt slower than the last — a
    // self-worsening cycle that guaranteed all 3 retries would eventually
    // time out, even though the model was genuinely completing the work
    // each time (just slightly too slowly). An AbortController tied to the
    // same timeout budget ensures a timed-out request is actually
    // cancelled, freeing the GPU for the next attempt instead of
    // competing with it.
    const abortController = new AbortController();
    const abortTimer = setTimeout(() => abortController.abort(), Math.max(this.config.timeoutMs - 1000, 1000));

    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload),
        signal: abortController.signal,
      });
    } finally {
      clearTimeout(abortTimer);
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`${response.status}: ${errText}`);
    }

    if (isStreamingRequest) {
      return await this.readSseStream(response);
    }

    const data = await response.json() as any;

    let text = '';
    if (name === 'anthropic') {
      text = data.content?.[0]?.text || '';
    } else if (name === 'google') {
      text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      text = data.choices?.[0]?.message?.content || '';
    }

    return text;
  }

  // Read an OpenAI-compatible SSE stream (data: {...}\n\n chunks, ending in
  // "data: [DONE]") and assemble it into the full completion text, the same
  // shape callProvider's non-streaming branches already return.
  private async readSseStream(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      // Fallback: some runtimes might not expose a streamable body the same
      // way — try reading it as plain text/JSON as a last resort.
      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content || '';
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // keep the last, possibly-incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;

        try {
          const chunk = JSON.parse(payload);
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) fullText += delta;
        } catch {
          // Ignore malformed/partial SSE lines rather than aborting the
          // whole response over one bad chunk.
        }
      }
    }

    return fullText;
  }

  private autoDetectBaseUrl(providerName: string): string {
    const known: Record<string, string> = {
      'groq':       'https://api.groq.com/openai/v1',
      'openrouter': 'https://openrouter.ai/api/v1',
      'openai':     'https://api.openai.com/v1',
      'together':   'https://api.together.xyz/v1',
      'deepseek':   'https://api.deepseek.com/v1',
      'mistral':    'https://api.mistral.ai/v1',
      'fireworks':  'https://api.fireworks.ai/inference/v1',
      'cerebras':   'https://api.cerebras.ai/v1',
      'xai':        'https://api.x.ai/v1',
    };

    // ⚠️ 'openailike' is intentionally NOT given a default here — its base
    // URL varies per deployment (e.g. a Colab/LocalTunnel/cloudflared URL
    // that changes every session), so there is no safe generic default.
    // If OPENAI_LIKE_API_BASE_URL wasn't set, fail loudly instead of
    // silently sending the request (and our local API key) to real OpenAI.
    if (providerName === 'openailike' && !known[providerName]) {
      throw new Error(
        'OpenAILike provider has no base URL configured. Set OPENAI_LIKE_API_BASE_URL in your environment.'
      );
    }

    return known[providerName] || 'https://api.openai.com/v1';
  }

  protected extractJson(text: string): string {
    let cleaned = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // ⚠️ FIX: small models sometimes abbreviate JSON output with a JS-style
    // comment instead of writing everything out, e.g.
    // `"categories": [ ... ] // Add more categories here` — this isn't
    // valid JSON and was causing "Failed to extract valid JSON" errors
    // (seen on the data agent). Strip `//comment` text, but only OUTSIDE
    // string literals, so URLs like "https://..." inside actual string
    // values are left untouched.
    cleaned = cleaned.replace(/("(?:[^"\\]|\\.)*")|(\/\/[^\n]*)/g, (_match, stringLiteral) =>
      stringLiteral !== undefined ? stringLiteral : ''
    );

    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');

    let start = -1;
    if (firstBrace === -1) start = firstBracket;
    else if (firstBracket === -1) start = firstBrace;
    else start = Math.min(firstBrace, firstBracket);

    if (start === -1) throw new Error('No JSON found in LLM response');

    const lastBrace = cleaned.lastIndexOf('}');
    const lastBracket = cleaned.lastIndexOf(']');
    const end = Math.max(lastBrace, lastBracket);

    if (end === -1) throw new Error('Invalid JSON in LLM response');

    cleaned = cleaned.substring(start, end + 1);
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    // Strip trailing commas before a closing brace/bracket — another common
    // small-model JSON mistake (and can appear after comment-stripping above).
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

    try {
      JSON.parse(cleaned);
      return cleaned;
    } catch {
      cleaned = cleaned.replace(
        /"((?:[^"\\]|\\.)*)"/g,
        (_match, p1) => `"${p1
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t')
        }"`
      );
      JSON.parse(cleaned);
      return cleaned;
    }
  }

  protected parseJson<T>(jsonString: string): T {
    try {
      return JSON.parse(jsonString) as T;
    } catch (e) {
      throw new Error(`Failed to parse JSON: ${e}`);
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Agent ${this.config.name} timed out after ${ms}ms`));
      }, ms);

      promise
        .then((result) => { clearTimeout(timer); resolve(result); })
        .catch((err) => { clearTimeout(timer); reject(err); });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}