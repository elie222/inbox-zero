import { LLMProvider, CompletionOptions, LLMResponse, LLMStreamEvent } from './types';
import { GeminiCLIExecutor } from './executors/gemini-cli';

export class ProviderManager {
  private providers: Map<string, LLMProvider> = new Map();

  constructor() {
    // Register CLI executors
    this.register(new GeminiCLIExecutor());

    // API providers are handled elsewhere in the app (Vercel AI SDK),
    // but this manager could be extended to include them if we wanted to unify everything here.
  }

  register(provider: LLMProvider) {
    this.providers.set(provider.name, provider);
  }

  async getAvailableProviders(): Promise<string[]> {
    const available: string[] = [];

    for (const [name, provider] of this.providers) {
      if (await provider.isAvailable()) {
        available.push(name);
      }
    }

    return available;
  }

  get(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  async complete(
    providerName: string,
    prompt: string,
    options?: CompletionOptions
  ): Promise<LLMResponse> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider '${providerName}' not found`);
    }
    return provider.complete(prompt, options);
  }

  async *stream(
    providerName: string,
    prompt: string,
    options?: CompletionOptions
  ): AsyncGenerator<LLMStreamEvent> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider '${providerName}' not found`);
    }
    yield* provider.stream(prompt, options);
  }
}

export const providerManager = new ProviderManager();
