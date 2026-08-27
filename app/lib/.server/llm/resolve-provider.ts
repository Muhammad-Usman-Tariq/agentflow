import { PROVIDER_LIST } from '~/utils/constants';

export interface LLMConfig {
  provider: (typeof PROVIDER_LIST)[number];
  providerName: string;
  model: string;
  apiKey: string;
  maxTokens?: number;
}

export function resolveLLMConfig(requestEnv?: Record<string, string | undefined> | null): LLMConfig {
  const env = requestEnv || {};
  const providerName = env.PROVIDER_NAME || process.env.PROVIDER_NAME || '';
  const model = env.DEFAULT_MODEL || process.env.DEFAULT_MODEL || '';
  const apiKey = env.PROVIDER_API_KEY || process.env.PROVIDER_API_KEY || '';
  const rawMaxTokens = env.MAX_COMPLETION_TOKENS || process.env.MAX_COMPLETION_TOKENS || '';
  const parsedMaxTokens = parseInt(rawMaxTokens, 10);
  const maxTokens = !isNaN(parsedMaxTokens) && parsedMaxTokens > 0 ? parsedMaxTokens : undefined;

  const provider = PROVIDER_LIST.find(
    (p) => p.name.toLowerCase() === providerName.toLowerCase()
  );

  if (!provider) {
    throw new Error(
      `PROVIDER_NAME is set to "${providerName}" but no matching provider is registered. ` +
      `Check PROVIDER_NAME in your env matches a real provider name exactly (e.g. "OpenAILike").`
    );
  }

  return {
    provider,
    providerName: provider.name,
    model,
    apiKey,
    maxTokens,
  };
}
