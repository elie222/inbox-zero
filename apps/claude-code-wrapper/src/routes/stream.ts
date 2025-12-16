import { Router, type Request, type Response } from "express";
import { spawn } from "node:child_process";
import { v4 as uuidv4 } from "uuid";
import { streamRequestSchema } from "../types.js";
import { buildClaudeEnv } from "../cli.js";
import { logger } from "../logger.js";

/** Default streaming timeout: 10 minutes (longer than non-streaming due to interactive nature) */
const DEFAULT_STREAM_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Type definitions for Claude CLI stream-json output format.
 * These types match the JSON objects emitted by `claude --output-format stream-json`.
 */
interface StreamAssistantMessage {
  type: "assistant";
  message?: {
    content?: Array<{ type: "text"; text: string }>;
  };
}

interface StreamResultMessage {
  type: "result";
  session_id?: string;
  total_tokens_in?: number;
  total_tokens_out?: number;
}

type StreamMessage = StreamAssistantMessage | StreamResultMessage;

const router = Router();

/**
 * POST /stream
 *
 * Streams Claude CLI output using Server-Sent Events (SSE).
 * This provides real-time streaming of Claude's response.
 *
 * Features:
 * - Execution timeout (10 minutes default)
 * - Line buffering for TCP chunk handling
 * - Proper cleanup on client disconnect
 */
router.post("/stream", async (req: Request, res: Response) => {
  const parseResult = streamRequestSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      error: "Invalid request body",
      code: "VALIDATION_ERROR",
      rawText: JSON.stringify(parseResult.error.issues),
    });
    return;
  }

  const { prompt, system, sessionId, model, userEmail } = parseResult.data;

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders(); // Important: send headers immediately for SSE

  // Track response state to prevent writes after close
  let isResponseClosed = false;
  let timeoutId: NodeJS.Timeout | undefined;

  // Build CLI arguments
  const args = buildStreamArgs({ prompt, system, sessionId, model });

  logger.info("Spawning Claude CLI for stream", { args });

  const claude = spawn("claude", args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: buildClaudeEnv({ userEmail }),
  });

  const currentSessionId = sessionId || uuidv4();

  // Safe event sender that checks response state
  const safeSendEvent = (event: string, data: unknown): boolean => {
    if (isResponseClosed) {
      logger.warn("Attempted to send event after response closed", { event });
      return false;
    }
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch (error) {
      logger.error("Failed to write SSE event", {
        event,
        error: error instanceof Error ? error.message : String(error),
      });
      isResponseClosed = true;
      return false;
    }
  };

  // Cleanup function to properly terminate everything
  const cleanup = (reason: string) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    if (claude.exitCode === null && !claude.killed) {
      logger.info("Killing Claude CLI process", { reason });
      claude.kill("SIGTERM");
      // Force kill after 1 second if still running
      setTimeout(() => {
        if (claude.exitCode === null && !claude.killed) {
          claude.kill("SIGKILL");
        }
      }, 1000);
    }
  };

  // Set up execution timeout
  timeoutId = setTimeout(() => {
    logger.error("Stream execution timed out", {
      timeoutMs: DEFAULT_STREAM_TIMEOUT_MS,
      sessionId: currentSessionId,
    });
    safeSendEvent("error", {
      error: `Stream timed out after ${DEFAULT_STREAM_TIMEOUT_MS / 1000} seconds`,
      code: "TIMEOUT_ERROR",
    });
    cleanup("timeout");
    safeSendEvent("done", { code: null, signal: "SIGTERM", reason: "timeout" });
    isResponseClosed = true;
    res.end();
  }, DEFAULT_STREAM_TIMEOUT_MS);

  // Send initial event with session info
  safeSendEvent("session", { sessionId: currentSessionId });

  // Line buffer for handling TCP chunking
  let lineBuffer = "";

  // Collect stderr for error reporting (but don't spam events)
  let stderrOutput = "";

  claude.stdout.on("data", (data: Buffer) => {
    // Append to buffer to handle partial lines from TCP chunking
    lineBuffer += data.toString();

    // Process complete lines only
    const lines = lineBuffer.split("\n");
    // Keep the last potentially incomplete line in the buffer
    lineBuffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const parsed = JSON.parse(line) as StreamMessage;
        if (parsed.type === "assistant" && parsed.message?.content) {
          // Text content chunk
          for (const block of parsed.message.content) {
            if (block.type === "text") {
              safeSendEvent("text", { text: block.text });
            }
          }
        } else if (parsed.type === "result") {
          // Final result
          safeSendEvent("result", {
            sessionId: parsed.session_id || currentSessionId,
            usage: {
              inputTokens: parsed.total_tokens_in || 0,
              outputTokens: parsed.total_tokens_out || 0,
              totalTokens:
                (parsed.total_tokens_in || 0) + (parsed.total_tokens_out || 0),
            },
          });
        }
      } catch (error) {
        // Only catch JSON parse errors - other errors should propagate
        if (error instanceof SyntaxError) {
          logger.warn("Stream: non-JSON line received, sending as raw text", {
            linePreview: line.slice(0, 100),
          });
          safeSendEvent("text", { text: line });
        } else {
          throw error;
        }
      }
    }
  });

  claude.stderr.on("data", (data: Buffer) => {
    const stderrChunk = data.toString();
    stderrOutput += stderrChunk;
    logger.warn("Claude CLI stderr", { stderr: stderrChunk });
    // Don't send every stderr chunk as an error event - aggregate and report on close
  });

  claude.on("close", (code, signal) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }

    logger.info("Claude CLI closed", { code, signal, stderrOutput });

    // Process any remaining data in line buffer
    if (lineBuffer.trim()) {
      try {
        const parsed = JSON.parse(lineBuffer) as StreamMessage;
        if (parsed.type === "result") {
          safeSendEvent("result", {
            sessionId: parsed.session_id || currentSessionId,
            usage: {
              inputTokens: parsed.total_tokens_in || 0,
              outputTokens: parsed.total_tokens_out || 0,
              totalTokens:
                (parsed.total_tokens_in || 0) + (parsed.total_tokens_out || 0),
            },
          });
        }
      } catch {
        // Final buffer wasn't valid JSON, ignore
      }
    }

    if (code !== 0 && !isResponseClosed) {
      const errorParts = [`CLI exited with code ${code}`];
      if (signal) errorParts.push(`signal: ${signal}`);
      if (stderrOutput) errorParts.push(stderrOutput.trim());

      safeSendEvent("error", {
        error: errorParts.join(" - "),
        code: "CLI_EXIT_ERROR",
      });
    }

    safeSendEvent("done", { code, signal });
    isResponseClosed = true;
    res.end();
  });

  claude.on("error", (error) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }

    logger.error("Claude CLI spawn error", { error: error.message });
    safeSendEvent("error", {
      error: error.message,
      code: "SPAWN_ERROR",
    });
    safeSendEvent("done", { code: null, signal: null, reason: "spawn_error" });
    isResponseClosed = true;
    res.end();
  });

  // Handle client disconnect - use res.on("close") for SSE
  // Note: req.on("close") fires immediately in some Express configurations
  res.on("close", () => {
    logger.info("Response closed event fired", {
      cliExitCode: claude.exitCode,
      cliKilled: claude.killed,
    });
    isResponseClosed = true;
    cleanup("client_disconnect");
  });

  claude.stdin.end();
});

/**
 * Builds CLI arguments for streaming mode.
 * Note: --verbose is required when using --output-format stream-json with --print
 */
function buildStreamArgs(options: {
  prompt: string;
  system?: string;
  sessionId?: string;
  model?: string;
}): string[] {
  // --verbose is required for stream-json output with --print
  const args: string[] = [
    "--print",
    "--verbose",
    "--output-format",
    "stream-json",
  ];

  // Model selection (alias like 'sonnet' or full name)
  if (options.model) {
    args.push("--model", options.model);
  }

  if (options.system) {
    args.push("--system-prompt", options.system);
  }

  // Resume specific session by ID
  if (options.sessionId) {
    args.push("--resume", options.sessionId);
  }

  args.push(options.prompt);

  return args;
}

export default router;
