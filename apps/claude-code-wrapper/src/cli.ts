import { spawn } from "node:child_process";
import { v4 as uuidv4 } from "uuid";
import type { ClaudeCliOutput, UsageInfo } from "./types.js";

export interface ClaudeCliOptions {
  prompt: string;
  system?: string;
  sessionId?: string;
  maxTokens?: number;
  outputFormat?: "json" | "text" | "stream-json";
}

export interface ClaudeCliResult {
  text: string;
  usage: UsageInfo;
  sessionId: string;
  rawOutput: ClaudeCliOutput | null;
}

/**
 * Executes Claude CLI as a subprocess and returns the result.
 *
 * Uses `claude --print` for non-interactive execution with JSON output format
 * for structured parsing of results including token usage.
 */
export async function executeClaudeCli(
  options: ClaudeCliOptions,
): Promise<ClaudeCliResult> {
  const args = buildCliArgs(options);

  return new Promise((resolve, reject) => {
    const claude = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    claude.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    claude.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    claude.on("close", (code) => {
      if (code !== 0) {
        reject(
          new ClaudeCliError(
            `Claude CLI exited with code ${code}`,
            "CLI_EXIT_ERROR",
            stderr || stdout,
          ),
        );
        return;
      }

      try {
        const result = parseCliOutput(stdout, options.sessionId);
        resolve(result);
      } catch (error) {
        reject(
          new ClaudeCliError(
            `Failed to parse CLI output: ${error instanceof Error ? error.message : "Unknown error"}`,
            "PARSE_ERROR",
            stdout,
          ),
        );
      }
    });

    claude.on("error", (error) => {
      reject(
        new ClaudeCliError(
          `Failed to spawn Claude CLI: ${error.message}`,
          "SPAWN_ERROR",
        ),
      );
    });

    // Send prompt via stdin if needed (for complex prompts)
    claude.stdin.end();
  });
}

/**
 * Builds command-line arguments for Claude CLI invocation.
 */
function buildCliArgs(options: ClaudeCliOptions): string[] {
  const args: string[] = ["--print", "--output-format", "json"];

  // System prompt
  if (options.system) {
    args.push("--system-prompt", options.system);
  }

  // Resume specific session by ID
  // Note: --continue resumes the most recent session, --resume <id> resumes a specific session
  if (options.sessionId) {
    args.push("--resume", options.sessionId);
  }

  // Note: --max-tokens is not supported by Claude CLI
  // Use --max-budget-usd for budget control if needed in future

  // The prompt itself
  args.push(options.prompt);

  return args;
}

/**
 * Parses JSON output from Claude CLI into structured result.
 */
function parseCliOutput(
  stdout: string,
  existingSessionId?: string,
): ClaudeCliResult {
  // Handle multiple JSON objects (streaming output produces multiple lines)
  const lines = stdout.trim().split("\n").filter(Boolean);

  // Find the final result object
  let resultOutput: ClaudeCliOutput | null = null;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as ClaudeCliOutput;
      if (parsed.type === "result") {
        resultOutput = parsed;
      }
    } catch {}
  }

  if (!resultOutput) {
    // Fallback: treat entire stdout as plain text result
    return {
      text: stdout.trim(),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      sessionId: existingSessionId || uuidv4(),
      rawOutput: null,
    };
  }

  return {
    text: resultOutput.result || "",
    usage: {
      inputTokens: resultOutput.total_tokens_in || 0,
      outputTokens: resultOutput.total_tokens_out || 0,
      totalTokens:
        (resultOutput.total_tokens_in || 0) +
        (resultOutput.total_tokens_out || 0),
    },
    sessionId: resultOutput.session_id || existingSessionId || uuidv4(),
    rawOutput: resultOutput,
  };
}

/**
 * Custom error class for Claude CLI errors with additional context.
 */
export class ClaudeCliError extends Error {
  code: string;
  rawOutput?: string;

  constructor(message: string, code: string, rawOutput?: string) {
    super(message);
    this.name = "ClaudeCliError";
    this.code = code;
    this.rawOutput = rawOutput;
  }
}
