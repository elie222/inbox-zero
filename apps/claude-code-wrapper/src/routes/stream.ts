import { Router, type Request, type Response } from "express";
import { spawn } from "node:child_process";
import { v4 as uuidv4 } from "uuid";
import { streamRequestSchema } from "../types.js";
import { buildClaudeEnv } from "../cli.js";

const router = Router();

/**
 * POST /stream
 *
 * Streams Claude CLI output using Server-Sent Events (SSE).
 * This provides real-time streaming of Claude's response.
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

  const { prompt, system, sessionId, maxTokens } = parseResult.data;

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Build CLI arguments
  const args = buildStreamArgs({ prompt, system, sessionId, maxTokens });

  const claude = spawn("claude", args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: buildClaudeEnv(),
  });

  const currentSessionId = sessionId || uuidv4();

  // Send initial event with session info
  sendEvent(res, "session", { sessionId: currentSessionId });

  claude.stdout.on("data", (data: Buffer) => {
    const chunk = data.toString();

    // Parse stream-json output
    const lines = chunk.split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "assistant" && parsed.message?.content) {
          // Text content chunk
          for (const block of parsed.message.content) {
            if (block.type === "text") {
              sendEvent(res, "text", { text: block.text });
            }
          }
        } else if (parsed.type === "result") {
          // Final result
          sendEvent(res, "result", {
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
        // For non-JSON output, send as raw text
        sendEvent(res, "text", { text: line });
      }
    }
  });

  claude.stderr.on("data", (data: Buffer) => {
    sendEvent(res, "error", { error: data.toString() });
  });

  claude.on("close", (code) => {
    if (code !== 0) {
      sendEvent(res, "error", {
        error: `CLI exited with code ${code}`,
        code: "CLI_EXIT_ERROR",
      });
    }
    sendEvent(res, "done", { code });
    res.end();
  });

  claude.on("error", (error) => {
    sendEvent(res, "error", {
      error: error.message,
      code: "SPAWN_ERROR",
    });
    res.end();
  });

  // Handle client disconnect
  req.on("close", () => {
    claude.kill();
  });

  claude.stdin.end();
});

/**
 * Builds CLI arguments for streaming mode.
 */
function buildStreamArgs(options: {
  prompt: string;
  system?: string;
  sessionId?: string;
  maxTokens?: number;
}): string[] {
  const args: string[] = ["--print", "--output-format", "stream-json"];

  if (options.system) {
    args.push("--system-prompt", options.system);
  }

  // Resume specific session by ID
  if (options.sessionId) {
    args.push("--resume", options.sessionId);
  }

  // Note: --max-tokens is not supported by Claude CLI

  args.push(options.prompt);

  return args;
}

/**
 * Sends an SSE event to the client.
 */
function sendEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export default router;
