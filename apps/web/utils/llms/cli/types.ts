export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMResponse {
  content: string;
  tokensUsed?: number;
  model?: string;
}

export interface LLMStreamEvent {
  type: 'text' | 'tool_use' | 'error' | 'done';
  content?: string;
  error?: string;
}

// The common interface both API and CLI providers implement
export interface LLMProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  complete(prompt: string, options?: CompletionOptions): Promise<LLMResponse>;
  stream(prompt: string, options?: CompletionOptions): AsyncGenerator<LLMStreamEvent>;
}

export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  workingDirectory?: string;  // For CLI tools that operate on files
  systemPrompt?: string;
}
