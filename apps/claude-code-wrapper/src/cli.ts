import { spawn } from "node:child_process";
import { v4 as uuidv4 } from "uuid";
import type { ClaudeCliOutput, UsageInfo } from "./types.js";
import { logger } from "./logger.js";

/**
 * Builds environment variables for Claude CLI with auth precedence.
 * Prefers OAuth token (Max subscription) over API key when both are present.
 */
export function buildClaudeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };

  // Prefer OAuth token for Max subscribers over API key
  if (env.CLAUDE_CODE_OAUTH_TOKEN) {
    env.ANTHROPIC_API_KEY = undefined;
  }

  return env;
}

/** Default CLI execution timeout: 5 minutes */
const DEFAULT_CLI_TIMEOUT_MS = 5 * 60 * 1000;

export interface ClaudeCliOptions {
  prompt: string;
  system?: string;
  sessionId?: string;
  maxTokens?: number;
  outputFormat?: "json" | "text" | "stream-json";
  /** Timeout in milliseconds. Default: 5 minutes */
  timeoutMs?: number;
  /** Model alias (e.g., 'sonnet', 'haiku') or full name */
  model?: string;
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
 *
 * Includes a configurable timeout (default: 5 minutes) to prevent hung processes.
 */
export async function executeClaudeCli(
  options: ClaudeCliOptions,
): Promise<ClaudeCliResult> {
  const args = buildCliArgs(options);
  const timeoutMs = options.timeoutMs ?? DEFAULT_CLI_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let isSettled = false;
    let timeoutId: NodeJS.Timeout | undefined;

    const claude = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: buildClaudeEnv(),
    });

    // Set up execution timeout
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          logger.error("Claude CLI execution timed out", {
            timeoutMs,
            prompt: options.prompt.slice(0, 100),
          });
          claude.kill("SIGTERM");
          // Give it a moment to clean up, then force kill
          setTimeout(() => claude.kill("SIGKILL"), 1000);
          reject(
            new ClaudeCliError(
              `Claude CLI execution timed out after ${timeoutMs}ms`,
              "TIMEOUT_ERROR",
            ),
          );
        }
      }, timeoutMs);
    }

    let stdout = "";
    let stderr = "";

    claude.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    claude.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    claude.on("close", (code) => {
      if (isSettled) return; // Already handled by timeout
      isSettled = true;
      if (timeoutId) clearTimeout(timeoutId);

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
      if (isSettled) return; // Already handled by timeout
      isSettled = true;
      if (timeoutId) clearTimeout(timeoutId);

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

  // Model selection (alias like 'sonnet' or full name)
  if (options.model) {
    args.push("--model", options.model);
  }

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
 * Throws an error if no valid result is found - callers should handle this
 * rather than receiving fabricated usage data.
 */
function parseCliOutput(
  stdout: string,
  existingSessionId?: string,
): ClaudeCliResult {
  // Handle multiple JSON objects (streaming output produces multiple lines)
  const lines = stdout.trim().split("\n").filter(Boolean);

  // Find the final result object
  let resultOutput: ClaudeCliOutput | null = null;
  let parseErrorCount = 0;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as ClaudeCliOutput;
      if (parsed.type === "result") {
        resultOutput = parsed;
      }
    } catch (error) {
      parseErrorCount++;
      // Log at debug level since non-JSON lines are expected in some outputs
      logger.warn("Failed to parse CLI output line as JSON", {
        line: line.slice(0, 200),
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  if (!resultOutput) {
    // Don't silently return fabricated data - throw so callers know something's wrong
    logger.error("No result object found in Claude CLI output", {
      lineCount: lines.length,
      parseErrorCount,
      stdoutPreview: stdout.slice(0, 500),
    });
    throw new Error(
      `No valid result found in CLI output (${lines.length} lines, ${parseErrorCount} parse errors). ` +
        `Output preview: ${stdout.slice(0, 200)}`,
    );
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
