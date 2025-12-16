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
  } catch {
    logger.warn("Failed to parse response as JSON", {
      status: response.status,
      bodyPreview: text.slice(0, 200),
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
  });

  return {
    text: result.text,
    usage: result.usage,
    sessionId: result.sessionId,
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
