import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ClaudeCodeConfig } from "./model";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("llms/claude-code");

/**
 * Usage information from Claude Code wrapper service.
 */
export interface ClaudeCodeUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Response from generate-text endpoint.
 */
interface GenerateTextResponse {
  text: string;
  usage: ClaudeCodeUsage;
  sessionId: string;
}

/**
 * Response from generate-object endpoint.
 */
interface GenerateObjectResponse {
  object: unknown;
  rawText: string;
  usage: ClaudeCodeUsage;
  sessionId: string;
}

/**
 * Error response from Claude Code wrapper service.
 */
interface ErrorResponse {
  error: string;
  code: string;
  rawText?: string;
}

/**
 * Custom error class for Claude Code HTTP client errors.
 */
export class ClaudeCodeError extends Error {
  code: string;
  rawText?: string;

  constructor(message: string, code: string, rawText?: string) {
    super(message);
    this.name = "ClaudeCodeError";
    this.code = code;
    this.rawText = rawText;
  }
}

/**
 * Safely parses JSON from a response, handling non-JSON bodies gracefully.
 */
async function safeJsonParse<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch (parseError) {
    logger.warn("Failed to parse response as JSON", {
      status: response.status,
      bodyPreview: text.slice(0, 200),
      parseError:
        parseError instanceof Error ? parseError.message : String(parseError),
    });
    return null;
  }
}

/**
 * Generates plain text response from Claude Code wrapper service.
 */
export async function claudeCodeGenerateText(
  config: ClaudeCodeConfig,
  options: {
    system?: string;
    prompt: string;
    sessionId?: string;
  },
): Promise<{
  text: string;
  usage: ClaudeCodeUsage;
  sessionId: string;
}> {
  logger.trace("Generating text via Claude Code", {
    baseUrl: config.baseUrl,
    hasSystem: !!options.system,
    promptLength: options.prompt.length,
  });

  const response = await fetch(`${config.baseUrl}/generate-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.authKey}`,
    },
    body: JSON.stringify({
      system: options.system,
      prompt: options.prompt,
      sessionId: options.sessionId,
      model: config.model,
    }),
    signal: AbortSignal.timeout(config.timeout),
  });

  if (!response.ok) {
    const errorBody = await safeJsonParse<ErrorResponse>(response);
    throw new ClaudeCodeError(
      errorBody?.error || `HTTP ${response.status} ${response.statusText}`,
      errorBody?.code || "HTTP_ERROR",
      errorBody?.rawText,
    );
  }

  const result = await safeJsonParse<GenerateTextResponse>(response);
  if (!result) {
    throw new ClaudeCodeError(
      "Invalid response from Claude Code wrapper: expected JSON",
      "INVALID_RESPONSE",
    );
  }

  logger.trace("Claude Code text generation complete", {
    textLength: result.text.length,
    usage: result.usage,
    sessionId: result.sessionId,
    model: config.model,
  });

  return {
    text: result.text,
    usage: result.usage,
    sessionId: result.sessionId,
  };
}

/**
 * Result from streaming text generation.
 */
export interface ClaudeCodeStreamResult {
  /** ReadableStream of text chunks as they arrive */
  textStream: ReadableStream<string>;
  /** Session ID for conversation continuity (resolves early in stream, after session event) */
  sessionId: Promise<string>;
  /** Usage stats (resolves when stream completes via result event) */
  usage: Promise<ClaudeCodeUsage>;
  /** Full accumulated text (resolves when stream completes) */
  text: Promise<string>;
}

/**
 * SSE event types from Claude Code wrapper /stream endpoint.
 */
interface SSETextEvent {
  text: string;
}

interface SSEResultEvent {
  sessionId: string;
  usage: ClaudeCodeUsage;
}

interface SSEErrorEvent {
  error: string;
  code?: string;
}

/**
 * Parses SSE events from a ReadableStream.
 * SSE format: "event: name\ndata: {...}\n\n"
 */
function createSSEParser(): TransformStream<
  Uint8Array,
  { event: string; data: string }
> {
  let buffer = "";

  return new TransformStream({
    transform(chunk, controller) {
      buffer += new TextDecoder().decode(chunk);

      // SSE events are separated by double newlines
      const events = buffer.split("\n\n");
      // Keep the last potentially incomplete event in the buffer
      buffer = events.pop() || "";

      for (const eventStr of events) {
        if (!eventStr.trim()) continue;

        const lines = eventStr.split("\n");
        let eventType = "";
        let data = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ")) {
            data = line.slice(6);
          }
        }

        if (eventType && data) {
          controller.enqueue({ event: eventType, data });
        }
      }
    },
    flush(controller) {
      // Process any remaining data in buffer
      if (buffer.trim()) {
        const lines = buffer.split("\n");
        let eventType = "";
        let data = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ")) {
            data = line.slice(6);
          }
        }

        if (eventType && data) {
          controller.enqueue({ event: eventType, data });
        }
      }
    },
  });
}

/**
 * Streams text response from Claude Code wrapper service.
 * Returns a ReadableStream of text chunks that can be consumed as they arrive.
 */
export async function claudeCodeStreamText(
  config: ClaudeCodeConfig,
  options: {
    system?: string;
    prompt: string;
    sessionId?: string;
  },
): Promise<ClaudeCodeStreamResult> {
  logger.trace("Starting text stream via Claude Code", {
    baseUrl: config.baseUrl,
    hasSystem: !!options.system,
    promptLength: options.prompt.length,
  });

  const response = await fetch(`${config.baseUrl}/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.authKey}`,
    },
    body: JSON.stringify({
      system: options.system,
      prompt: options.prompt,
      sessionId: options.sessionId,
      model: config.model,
    }),
    signal: AbortSignal.timeout(config.timeout),
  });

  if (!response.ok) {
    const errorBody = await safeJsonParse<ErrorResponse>(response);
    throw new ClaudeCodeError(
      errorBody?.error || `HTTP ${response.status} ${response.statusText}`,
      errorBody?.code || "HTTP_ERROR",
      errorBody?.rawText,
    );
  }

  if (!response.body) {
    throw new ClaudeCodeError(
      "No response body from Claude Code wrapper",
      "NO_RESPONSE_BODY",
    );
  }

  // Set up promises for session, usage, and accumulated text
  let resolveSessionId: (value: string) => void;
  let rejectSessionId: (error: Error) => void;
  const sessionIdPromise = new Promise<string>((resolve, reject) => {
    resolveSessionId = resolve;
    rejectSessionId = reject;
  });

  let resolveUsage: (value: ClaudeCodeUsage) => void;
  let rejectUsage: (error: Error) => void;
  const usagePromise = new Promise<ClaudeCodeUsage>((resolve, reject) => {
    resolveUsage = resolve;
    rejectUsage = reject;
  });

  let resolveText: (value: string) => void;
  let rejectText: (error: Error) => void;
  const textPromise = new Promise<string>((resolve, reject) => {
    resolveText = resolve;
    rejectText = reject;
  });

  let accumulatedText = "";
  let sessionIdReceived = false;
  let usageReceived = false;

  // Transform SSE events into text chunks
  const textStream = response.body.pipeThrough(createSSEParser()).pipeThrough(
    new TransformStream<{ event: string; data: string }, string>({
      transform(sseEvent, controller) {
        // Critical events (session, result, error, done) must propagate parse errors
        // Text events can log and continue - degraded content is better than total failure
        const isCriticalEvent = ["session", "result", "error", "done"].includes(
          sseEvent.event,
        );

        try {
          switch (sseEvent.event) {
            case "session": {
              const parsed = JSON.parse(sseEvent.data) as { sessionId: string };
              if (!sessionIdReceived) {
                sessionIdReceived = true;
                resolveSessionId(parsed.sessionId);
              }
              break;
            }
            case "text": {
              const parsed = JSON.parse(sseEvent.data) as SSETextEvent;
              accumulatedText += parsed.text;
              controller.enqueue(parsed.text);
              break;
            }
            case "result": {
              const parsed = JSON.parse(sseEvent.data) as SSEResultEvent;
              usageReceived = true;
              resolveUsage(parsed.usage);
              if (!sessionIdReceived) {
                sessionIdReceived = true;
                resolveSessionId(parsed.sessionId);
              }
              break;
            }
            case "error": {
              const parsed = JSON.parse(sseEvent.data) as SSEErrorEvent;
              if (!parsed.code) {
                logger.warn(
                  "SSE error event missing error code - using generic STREAM_ERROR",
                  { errorMessage: parsed.error },
                );
              }
              const error = new ClaudeCodeError(
                parsed.error,
                parsed.code || "STREAM_ERROR",
              );
              usageReceived = true; // Prevent double rejection in flush
              rejectUsage(error);
              rejectText(error);
              if (!sessionIdReceived) {
                rejectSessionId(error);
              }
              controller.error(error);
              break;
            }
            case "done": {
              // Stream complete, resolve the text promise
              resolveText(accumulatedText);
              logger.trace("Claude Code stream complete", {
                textLength: accumulatedText.length,
              });
              break;
            }
          }
        } catch (parseError) {
          if (isCriticalEvent) {
            // Critical event parse failure - propagate error
            logger.error(
              "Failed to parse critical SSE event - stream integrity compromised",
              {
                event: sseEvent.event,
                data: sseEvent.data.slice(0, 100),
                error: parseError,
              },
            );
            const error = new ClaudeCodeError(
              `Failed to parse critical SSE event: ${sseEvent.event}`,
              "SSE_PARSE_ERROR",
            );
            if (!usageReceived) {
              usageReceived = true;
              rejectUsage(error);
            }
            rejectText(error);
            if (!sessionIdReceived) {
              rejectSessionId(error);
            }
            controller.error(error);
          } else {
            // Non-critical event (text) - log and continue
            logger.warn("Failed to parse SSE text event - continuing stream", {
              event: sseEvent.event,
              data: sseEvent.data.slice(0, 100),
              error: parseError,
            });
          }
        }
      },
      flush() {
        // Handle promises that were never resolved/rejected during stream
        if (!sessionIdReceived) {
          rejectSessionId(
            new ClaudeCodeError(
              "Stream ended without session ID",
              "NO_SESSION",
            ),
          );
        }
        if (!usageReceived) {
          rejectUsage(
            new ClaudeCodeError(
              "Stream ended without usage information",
              "NO_USAGE",
            ),
          );
        }
        resolveText(accumulatedText);
      },
    }),
  );

  return {
    textStream,
    sessionId: sessionIdPromise,
    usage: usagePromise,
    text: textPromise,
  };
}

/**
 * Generates structured JSON response from Claude Code wrapper service.
 * Converts Zod schema to JSON Schema for the wrapper service.
 */
export async function claudeCodeGenerateObject<T>(
  config: ClaudeCodeConfig,
  options: {
    system?: string;
    prompt: string;
    schema: z.ZodSchema<T>;
    sessionId?: string;
  },
): Promise<{
  object: T;
  rawText: string;
  usage: ClaudeCodeUsage;
  sessionId: string;
}> {
  // Convert Zod schema to JSON Schema for the wrapper service
  const jsonSchema = zodToJsonSchema(options.schema, {
    $refStrategy: "none",
    target: "jsonSchema7",
  });

  logger.trace("Generating object via Claude Code", {
    baseUrl: config.baseUrl,
    hasSystem: !!options.system,
    promptLength: options.prompt.length,
  });

  const response = await fetch(`${config.baseUrl}/generate-object`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.authKey}`,
    },
    body: JSON.stringify({
      system: options.system,
      prompt: options.prompt,
      schema: jsonSchema,
      sessionId: options.sessionId,
      model: config.model,
    }),
    signal: AbortSignal.timeout(config.timeout),
  });

  if (!response.ok) {
    const errorBody = await safeJsonParse<ErrorResponse>(response);
    throw new ClaudeCodeError(
      errorBody?.error || `HTTP ${response.status} ${response.statusText}`,
      errorBody?.code || "HTTP_ERROR",
      errorBody?.rawText,
    );
  }

  const result = await safeJsonParse<GenerateObjectResponse>(response);
  if (!result) {
    throw new ClaudeCodeError(
      "Invalid response from Claude Code wrapper: expected JSON",
      "INVALID_RESPONSE",
    );
  }

  // Validate the response against the Zod schema
  const parseResult = options.schema.safeParse(result.object);
  if (!parseResult.success) {
    logger.warn("Claude Code response failed Zod validation", {
      errors: parseResult.error.issues,
      rawText: result.rawText?.slice(0, 200),
    });
    throw new ClaudeCodeError(
      `Response validation failed: ${parseResult.error.message}`,
      "VALIDATION_ERROR",
      result.rawText,
    );
  }

  logger.trace("Claude Code object generation complete", {
    usage: result.usage,
    sessionId: result.sessionId,
  });

  return {
    object: parseResult.data,
    rawText: result.rawText,
    usage: result.usage,
    sessionId: result.sessionId,
  };
}
