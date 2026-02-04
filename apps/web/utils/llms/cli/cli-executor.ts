import { spawn, ChildProcess } from 'child_process';
import { LLMProvider, LLMResponse, LLMStreamEvent, CompletionOptions } from './types';
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("llms/cli-executor");

export abstract class CLIExecutor implements LLMProvider {
  abstract name: string;

  // Each CLI tool defines these
  abstract getCommand(): string;
  abstract getArgs(prompt: string, options?: CompletionOptions): string[];
  abstract parseOutput(line: string): LLMStreamEvent | null;

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const command = this.getCommand();
      const proc = spawn('which', [command]);
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<LLMResponse> {
    const chunks: string[] = [];

    for await (const event of this.stream(prompt, options)) {
      if (event.type === 'text' && event.content) {
        chunks.push(event.content);
      }
      if (event.type === 'error') {
        throw new Error(event.error);
      }
    }

    return { content: chunks.join('') };
  }

  async *stream(prompt: string, options?: CompletionOptions): AsyncGenerator<LLMStreamEvent> {
    const command = this.getCommand();
    const args = this.getArgs(prompt, options);

    logger.debug("Spawning CLI command", { command, args });

    const proc = spawn(command, args, {
      cwd: options?.workingDirectory || process.cwd(),
      env: { ...process.env },  // Inherit env vars (for API keys)
    });

    // Handle stdout line by line
    // let buffer = ''; // Buffer is unused in original code, but might be needed if I implement lineIterator differently.
    // The original code passed buffer to createLineIterator but didn't use it.

    const processLine = (line: string): LLMStreamEvent | null => {
      if (!line.trim()) return null;
      return this.parseOutput(line);
    };

    // Create async iterator from process streams
    const lineIterator = this.createLineIterator(proc);

    for await (const line of lineIterator) {
      const event = processLine(line);
      if (event) yield event;
    }

    yield { type: 'done' };
  }

  private async *createLineIterator(proc: ChildProcess): AsyncGenerator<string> {
    const readline = await import('readline');
    if (!proc.stdout) throw new Error("Child process has no stdout");

    const rl = readline.createInterface({ input: proc.stdout });

    for await (const line of rl) {
      yield line;
    }

    // Wait for process to complete
    await new Promise<void>((resolve, reject) => {
      proc.on('close', (code) => {
        if (code !== 0) {
          // Check if we have stderr
          // Note: createLineIterator doesn't consume stderr.
          // We should probably read stderr if it fails.
          // But strict following of provided code:
          reject(new Error(`Process exited with code ${code}`));
        } else {
          resolve();
        }
      });
      proc.on('error', reject);
    });
  }
}
