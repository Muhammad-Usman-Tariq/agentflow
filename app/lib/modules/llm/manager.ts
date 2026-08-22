import type { IProviderSetting } from '~/types/model';
import { BaseProvider } from './base-provider';
import {
  AnthropicProvider,
  GoogleProvider,
  GroqProvider,
  OllamaProvider,
  OpenRouterProvider,
  OpenAIProvider,
  OpenAILikeProvider,
} from './registry';
import type { ModelInfo } from './types';

export class LLMManager {
  private static _instance: LLMManager;
  private _providers: Map<string, BaseProvider> = new Map();
  private _env: Record<string, string> = {};

  private constructor() {
    this._registerProviders();
  }

  // ✅ env accept karta hai ab
  static getInstance(env?: Record<string, string>): LLMManager {
    if (!LLMManager._instance) {
      LLMManager._instance = new LLMManager();
    }
    if (env) {
      LLMManager._instance._env = env;
    }
    return LLMManager._instance;
  }

  private _registerProviders() {
    const allProviders = [
      new AnthropicProvider(),
      new GoogleProvider(),
      new GroqProvider(),
      new OllamaProvider(),
      new OpenRouterProvider(),
      new OpenAIProvider(),
      new OpenAILikeProvider(),
    ];
    for (const provider of allProviders) {
      this._providers.set(provider.name.toLowerCase(), provider);
    }
  }

  // ✅ env se active provider
  getActiveProvider(): BaseProvider | undefined {
    const providerName = (
      this._env.PROVIDER_NAME ||
      process.env.PROVIDER_NAME ||
      ''
    ).toLowerCase();
    return this._providers.get(providerName) || this._providers.get('openai');
  }

  // ✅ MISSING — ab exist karta hai
  getDefaultProvider(): BaseProvider {
    const active = this.getActiveProvider();
    if (active) return active;
    // fallback — pehla provider
    return Array.from(this._providers.values())[0];
  }

  getProvider(name: string): BaseProvider | undefined {
    return this._providers.get(name.toLowerCase());
  }

  getAllProviders(): BaseProvider[] {
    return Array.from(this._providers.values());
  }

  // ✅ MISSING — ab exist karta hai
  async getModelListFromProvider(
    provider: BaseProvider,
    options: {
      apiKeys?: Record<string, string>;
      providerSettings?: Record<string, IProviderSetting>;
      serverEnv?: Record<string, string>;
    }
  ): Promise<ModelInfo[]> {
    const env = options.serverEnv || this._env || {};
    const model = env.DEFAULT_MODEL || process.env.DEFAULT_MODEL || '';

    return [{
      name: model || provider.staticModels?.[0]?.name || '',
      label: model || provider.staticModels?.[0]?.label || '',
      provider: provider.name,
      maxTokenAllowed: 8000,
    }];
  }

  // ✅ MISSING — ab exist karta hai
  async updateModelList(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    serverEnv?: Record<string, string>;
  }): Promise<ModelInfo[]> {
    const env = options.serverEnv || this._env || {};
    const providerName = env.PROVIDER_NAME || process.env.PROVIDER_NAME || '';
    const model = env.DEFAULT_MODEL || process.env.DEFAULT_MODEL || '';

    return [{
      name: model,
      label: model,
      provider: providerName,
      maxTokenAllowed: 8000,
    }];
  }

  getModelInstance(options: {
    model: string;
    serverEnv?: Record<string, string> | any;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }) {
    const env = options.serverEnv || this._env || {};
    const providerName = (
      env.PROVIDER_NAME ||
      process.env.PROVIDER_NAME ||
      ''
    ).toLowerCase();
    const apiKey = env.PROVIDER_API_KEY || process.env.PROVIDER_API_KEY || '';
    const model = options.model || env.DEFAULT_MODEL || process.env.DEFAULT_MODEL || '';
    const baseURL = env.PROVIDER_BASE_URL || process.env.PROVIDER_BASE_URL || '';

    const provider = this._providers.get(providerName);

    if (provider) {
      return provider.getModelInstance({
        model,
        serverEnv: env as any,
        apiKeys: { [provider.name]: apiKey },
        providerSettings: options.providerSettings,
      });
    }

    // Unknown provider — OpenAI compatible
    const { createOpenAI } = require('@ai-sdk/openai');
    const client = createOpenAI({
      baseURL: baseURL || 'http://localhost:11434/v1',
      apiKey: apiKey || 'dummy',
    });
    return client(model);
  }

  async getModelList(options: {
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
    serverEnv?: Record<string, string>;
  }) {
    return this.updateModelList(options);
  }
}