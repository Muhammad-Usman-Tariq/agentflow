import AnthropicProvider from './providers/anthropic';
import GoogleProvider from './providers/google';
import GroqProvider from './providers/groq';
import OllamaProvider from './providers/ollama';
import OpenRouterProvider from './providers/open-router';
import OpenAIProvider from './providers/openai';
import OpenAILikeProvider from './providers/openai-like';

// Dynamic provider — PROVIDER_NAME ENV se auto-detect
// Koi bhi OpenAI-compatible server kaam karega
class DynamicProvider {
  name: string;
  staticModels: any[];
  
  constructor() {
    this.name = process.env.PROVIDER_NAME || 'CustomProvider';
    this.staticModels = [
      {
        name: process.env.DEFAULT_MODEL || 'default',
        label: process.env.DEFAULT_MODEL || 'Default Model',
        provider: this.name,
        maxTokenAllowed: 8000,
      }
    ];
  }

  getApiKeyLink = '';
  
  config = {
    apiTokenKey: 'PROVIDER_API_KEY',
  };

  getModelInstance(options: any) {
    const baseURL = process.env.PROVIDER_BASE_URL || 'http://localhost:11434/v1';
    const apiKey = process.env.PROVIDER_API_KEY || 'dummy';
    
    const { createOpenAI } = require('@ai-sdk/openai');
    const client = createOpenAI({ baseURL, apiKey });
    return client(options.model);
  }
}

export {
  AnthropicProvider,
  GoogleProvider,
  GroqProvider,
  OllamaProvider,
  OpenRouterProvider,
  OpenAIProvider,
  OpenAILikeProvider,
};