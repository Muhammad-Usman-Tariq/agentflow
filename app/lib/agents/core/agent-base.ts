import type { AgentInput, AgentOutput, AgentConfig, IAgent } from '../types/agent.types';

interface ProviderConfig {
  name: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface CallProviderResult {
  text: string;
  finishReason: string | null;
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
    expectJson: boolean = false,
    timeoutOverrideMs?: number,
    overrideMaxTokens?: number
  ): Promise<string> {
    const providers = this.buildProviderList();

    if (providers.length === 0) {
      throw new Error('No providers configured. Please set PROVIDER_NAME and PROVIDER_API_KEY.');
    }

    let lastError = '';

    for (const provider of providers) {
      try {
        console.log(`[${this.config.name}] Trying: ${provider.name} / ${provider.model}`);
        let result = await this.callProvider(provider, systemPrompt, userMessage, timeoutOverrideMs, overrideMaxTokens);
        let accumulatedText = result.text;
        let finishReason = result.finishReason;

        // Auto-continue loop if truncated and expecting JSON or if finishReason === 'length'
        const MAX_CONTINUATION_ROUNDS = 3;
        let continuationRound = 0;

        while (
          continuationRound < MAX_CONTINUATION_ROUNDS &&
          (finishReason === 'length' || (expectJson && !this.isValidJson(accumulatedText) && finishReason === 'length'))
        ) {
          continuationRound++;
          console.warn(
            `[${this.config.name}] ⚠️ Truncation detected (finishReason='${finishReason}'). Auto-continuing round ${continuationRound}/${MAX_CONTINUATION_ROUNDS}...`
          );

          const continuationPrompt = `Your previous response was cut off / truncated. Continue generating from exactly where you stopped. Output ONLY the continuation text — no repetition of what you already wrote, no commentary. Partial output so far:\n${accumulatedText.slice(-800)}`;

          const contResult = await this.callProvider(
            provider,
            systemPrompt,
            continuationPrompt,
            timeoutOverrideMs,
            overrideMaxTokens
          );

          accumulatedText += contResult.text;
          finishReason = contResult.finishReason;

          if (expectJson && this.isValidJson(accumulatedText)) {
            console.log(`[${this.config.name}] ✅ Auto-continuation successfully produced valid JSON on round ${continuationRound}`);
            break;
          }
        }

        if (accumulatedText) {
          console.log(`[${this.config.name}] ✅ Success with: ${provider.name}`);
          return expectJson ? this.extractJson(accumulatedText) : accumulatedText;
        }

      } catch (error: any) {
        lastError = error.message;
        console.warn(`[${this.config.name}] ⚠️ ${provider.name} failed: ${error.message}`);
        console.log(`[${this.config.name}] → Trying next provider...`);
      }
    }

    throw new Error(`All providers failed. Last error: ${lastError}`);
  }

  private isValidJson(text: string): boolean {
    try {
      this.extractJson(text);
      return true;
    } catch {
      return false;
    }
  }

  protected stripCodeFence(text: string): string {
    const stripFence = (s: string): string =>
      s
        .trim()
        .replace(/^```[a-zA-Z0-9_-]*\r?\n/, '')
        .replace(/\r?\n```\s*$/, '')
        .trim();

    let cleaned = stripFence(text);

    const artifactMatch = cleaned.match(/<boltArtifact[^>]*>([\s\S]*)<\/boltArtifact>/i);
    if (artifactMatch) cleaned = artifactMatch[1].trim();

    const actionMatch = cleaned.match(/<boltAction[^>]*>([\s\S]*)<\/boltAction>/i);
    if (actionMatch) cleaned = actionMatch[1].trim();

    cleaned = cleaned
      .replace(/^<boltArtifact[^>]*>\s*/i, '')
      .replace(/^<boltAction[^>]*>\s*/i, '')
      .replace(/\s*<\/boltAction>\s*$/i, '')
      .replace(/\s*<\/boltArtifact>\s*$/i, '')
      .trim();

    cleaned = stripFence(cleaned);

    return cleaned;
  }

  protected sanitizeFileMap(files: Record<string, string> | undefined | null): Record<string, string> {
    if (!files) return {};
    const cleaned: Record<string, string> = {};
    for (const [path, content] of Object.entries(files)) {
      cleaned[path] = typeof content === 'string' ? this.stripCodeFence(content) : (content as any);
    }
    return cleaned;
  }

  private buildProviderList(): ProviderConfig[] {
    const providers: ProviderConfig[] = [];
    const e = this.env;

    const name = e.PROVIDER_NAME || process.env.PROVIDER_NAME;
    const apiKey = e.PROVIDER_API_KEY || process.env.PROVIDER_API_KEY;
    const model = e.DEFAULT_MODEL || process.env.DEFAULT_MODEL || '';
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
    userMessage: string,
    timeoutOverrideMs?: number,
    overrideMaxTokens?: number
  ): Promise<CallProviderResult> {
    const { name, apiKey, model, baseUrl } = provider;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const envMaxTokens = this.env?.MAX_COMPLETION_TOKENS
      ? parseInt(this.env.MAX_COMPLETION_TOKENS, 10)
      : (process.env.MAX_COMPLETION_TOKENS ? parseInt(process.env.MAX_COMPLETION_TOKENS, 10) : NaN);
    const defaultMaxTokens = Number.isFinite(envMaxTokens) && envMaxTokens > 0 ? envMaxTokens : 8000;
    const maxTokens = overrideMaxTokens ?? defaultMaxTokens;

    let apiUrl = '';
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
    let bodyPayload: any = {};
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

    const effectiveTimeoutMs = timeoutOverrideMs ?? this.config.timeoutMs;
    const abortController = new AbortController();
    const abortTimer = setTimeout(() => abortController.abort(), Math.max(effectiveTimeoutMs - 1000, 1000));

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
    let finishReason: string | null = null;
    if (name === 'anthropic') {
      text = data.content?.[0]?.text || '';
      const stopReason = data.stop_reason;
      finishReason = stopReason === 'max_tokens' ? 'length' : (stopReason ? 'stop' : null);
    } else if (name === 'google') {
      text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const finishReasonRaw = data.candidates?.[0]?.finishReason;
      finishReason = finishReasonRaw === 'MAX_TOKENS' ? 'length' : (finishReasonRaw ? 'stop' : null);
    } else {
      text = data.choices?.[0]?.message?.content || '';
      finishReason = data.choices?.[0]?.finish_reason || null;
    }

    return { text, finishReason };
  }

  private async readSseStream(response: Response): Promise<CallProviderResult> {
    const reader = response.body?.getReader();
    if (!reader) {
      const data = await response.json() as any;
      const text = data.choices?.[0]?.message?.content || '';
      const finishReason = data.choices?.[0]?.finish_reason || null;
      return { text, finishReason };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let finishReason: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;

        try {
          const chunk = JSON.parse(payload);
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) fullText += delta;

          const reasonChunk = chunk.choices?.[0]?.finish_reason;
          if (reasonChunk) finishReason = reasonChunk;
        } catch {
        }
      }
    }

    return { text: fullText, finishReason };
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

    if (providerName === 'openailike' && !known[providerName]) {
      throw new Error(
        'OpenAILike provider has no base URL configured. Set OPENAI_LIKE_API_BASE_URL in your environment.'
      );
    }

    return known[providerName] || 'https://api.openai.com/v1';
  }

  private findBalancedJsonSpan(str: string, start: number): string | null {
    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = start; i < str.length; i++) {
      const ch = str[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (ch === '\\') {
        if (inString) escapeNext = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === '{' || ch === '[') {
        depth++;
      } else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) return str.substring(start, i + 1);
        if (depth < 0) return null;
      }
    }
    return null;
  }

  private stripJsonComments(jsonCandidate: string): string {
    let out = jsonCandidate.replace(/("(?:[^"\\]|\\.)*")|(\/\/[^\n]*)/g, (_m, stringLiteral) =>
      stringLiteral !== undefined ? stringLiteral : ''
    );
    out = out.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    out = out.replace(/,(\s*[}\]])/g, '$1');
    return out;
  }

  protected extractJson(text: string): string {
    const cleanedFence = text
      .replace(/```json\n?/gi, '')
      .replace(/```\n?/g, '')
      .trim();

    const candidateStarts: number[] = [];
    for (let i = 0; i < cleanedFence.length; i++) {
      if (cleanedFence[i] === '{' || cleanedFence[i] === '[') candidateStarts.push(i);
    }

    const attempts: string[] = [];

    for (const start of candidateStarts.slice(0, 25)) {
      const span = this.findBalancedJsonSpan(cleanedFence, start);
      if (!span) continue;

      const candidate = this.stripJsonComments(span);
      attempts.push(candidate);

      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        try {
          const repaired = candidate.replace(
            /"((?:[^"\\]|\\.)*)"/g,
            (_m, p1) => `"${p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`
          );
          JSON.parse(repaired);
          return repaired;
        } catch {
          continue;
        }
      }
    }

    const preview = text.length > 1500 ? `${text.slice(0, 800)}\n...[truncated]...\n${text.slice(-700)}` : text;
    console.error(`[${this.config.name}] ❌ Could not extract valid JSON. Raw response:\n${preview}`);

    throw new Error(
      candidateStarts.length === 0
        ? 'No JSON found in LLM response'
        : `Found ${candidateStarts.length} candidate JSON start(s) but none parsed successfully (response likely truncated — consider raising MAX_COMPLETION_TOKENS)`
    );
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
