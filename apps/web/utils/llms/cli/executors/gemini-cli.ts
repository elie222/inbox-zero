import { CLIExecutor } from '../cli-executor';
import { LLMStreamEvent, CompletionOptions } from '../types';

export class GeminiCLIExecutor extends CLIExecutor {
  name = 'gemini-cli';

  getCommand(): string {
    return 'gemini';
  }

  getArgs(prompt: string, options?: CompletionOptions): string[] {
    const args = [
      '--yolo',  // Skip confirmation prompts
    ];

    if (options?.systemPrompt) {
      args.push('--system', options.systemPrompt);
    }

    // Gemini CLI takes prompt as positional arg
    args.push(prompt);

    return args;
  }

  parseOutput(line: string): LLMStreamEvent | null {
    try {
      const data = JSON.parse(line);

      if (data.type === 'response' || data.type === 'text') {
        return { type: 'text', content: data.content };
      }
      if (data.error) {
        return { type: 'error', error: data.error };
      }
      return null;
    } catch {
      // Plain text output
      return { type: 'text', content: line };
    }
  }
}
