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
    },
    body: JSON.stringify({
      system: options.system,
      prompt: options.prompt,
      sessionId: options.sessionId,
    }),
    signal: AbortSignal.timeout(config.timeout),
  });

  if (!response.ok) {
    const errorBody = (await response.json()) as ErrorResponse;
    throw new ClaudeCodeError(
      errorBody.error || `HTTP ${response.status}`,
      errorBody.code || "HTTP_ERROR",
      errorBody.rawText,
    );
  }

  const result = (await response.json()) as GenerateTextResponse;

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
    const errorBody = (await response.json()) as ErrorResponse;
    throw new ClaudeCodeError(
      errorBody.error || `HTTP ${response.status}`,
      errorBody.code || "HTTP_ERROR",
      errorBody.rawText,
    );
  }

  const result = (await response.json()) as GenerateObjectResponse;

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
