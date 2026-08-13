import type { IProviderSetting } from '~/types/model';
import { BaseProvider } from './base-provider';
import {
  AnthropicProvider,
  GoogleProvider,
  GroqProvider,
  OllamaProvider,
  OpenRouterProvider,
  OpenAIProvider,
} from './registry';

export class LLMManager {
  private static _instance: LLMManager;
  private _providers: Map<string, BaseProvider> = new Map();

  private constructor() {
    this._registerProviders();
  }

  static getInstance(): LLMManager {
    if (!LLMManager._instance) {
      LLMManager._instance = new LLMManager();
    }
    return LLMManager._instance;
  }

  private _registerProviders() {
    // Register all available providers
    const allProviders = [
      new AnthropicProvider(),
      new GoogleProvider(),
      new GroqProvider(),
      new OllamaProvider(),
      new OpenRouterProvider(),
      new OpenAIProvider(),
    ];

    for (const provider of allProviders) {
      this._providers.set(provider.name.toLowerCase(), provider);
    }
  }

  // Get active provider from ENV
  getActiveProvider(): BaseProvider | undefined {
    const providerName = (process.env.PROVIDER_NAME || '').toLowerCase();
    
    // Known providers
    const known = this._providers.get(providerName);
    if (known) return known;

    // Unknown/Custom provider — use OpenAI compatible
    // Works with: local models, Chinese models, private servers
    const openai = this._providers.get('openai');
    return openai;
  }

  getProvider(name: string): BaseProvider | undefined {
    return this._providers.get(name.toLowerCase());
  }

  getAllProviders(): BaseProvider[] {
    return Array.from(this._providers.values());
  }

  // Get model instance — works with any provider
 getModelInstance(options: {
  model: string;
  serverEnv?: Record<string, string> | any;
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, IProviderSetting>;
}) {
    const env = options.serverEnv || {};
    const providerName = (env.PROVIDER_NAME || process.env.PROVIDER_NAME || '').toLowerCase();
    const apiKey = env.PROVIDER_API_KEY || process.env.PROVIDER_API_KEY || '';
    const model = options.model || env.DEFAULT_MODEL || process.env.DEFAULT_MODEL || '';
    const baseURL = env.PROVIDER_BASE_URL || process.env.PROVIDER_BASE_URL || '';

    // Try known provider first
    const provider = this._providers.get(providerName);
    
    if (provider) {
      return provider.getModelInstance({
               model,
               serverEnv: env as any,
               apiKeys: { [provider.name]: apiKey },
               providerSettings: options.providerSettings,
                });
    }

    // Unknown provider — OpenAI compatible (local, Chinese models, private servers)
    // Just set PROVIDER_BASE_URL and PROVIDER_API_KEY in .env.local
    const { createOpenAI } = require('@ai-sdk/openai');
    const client = createOpenAI({
      baseURL: baseURL || 'http://localhost:11434/v1',
      apiKey: apiKey || 'dummy',
    });
    return client(model);
  }

  // Get all models for UI display
  async getModelList(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    serverEnv?: Record<string, string>;
  }) {
    const env = options.serverEnv || {};
    const providerName = env.PROVIDER_NAME || process.env.PROVIDER_NAME || '';
    const model = env.DEFAULT_MODEL || process.env.DEFAULT_MODEL || '';

    // Return just the configured model
    return [{
      name: model,
      label: model,
      provider: providerName,
      maxTokenAllowed: 8000,
    }];
  }
}