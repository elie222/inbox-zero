import { z } from "zod";

// Request schemas
export const generateTextRequestSchema = z.object({
  system: z.string().optional(),
  prompt: z.string(),
  sessionId: z.string().optional(),
  maxTokens: z.number().optional(),
  model: z.string().optional(),
  /** User email for tool proxy access (enables Claude skills to call Inbox Zero tools) */
  userEmail: z.string().email().optional(),
});

export const generateObjectRequestSchema = z.object({
  system: z.string().optional(),
  prompt: z.string(),
  schema: z.record(z.unknown()),
  sessionId: z.string().optional(),
  maxTokens: z.number().optional(),
  model: z.string().optional(),
  /** User email for tool proxy access (enables Claude skills to call Inbox Zero tools) */
  userEmail: z.string().email().optional(),
});

export const streamRequestSchema = z.object({
  system: z.string().optional(),
  prompt: z.string(),
  sessionId: z.string().optional(),
  model: z.string().optional(),
  /** User email for tool proxy access (enables Claude skills to call Inbox Zero tools) */
  userEmail: z.string().email().optional(),
});

// Inferred types
export type GenerateTextRequest = z.infer<typeof generateTextRequestSchema>;
export type GenerateObjectRequest = z.infer<typeof generateObjectRequestSchema>;
export type StreamRequest = z.infer<typeof streamRequestSchema>;

// Response types
export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface GenerateTextResponse {
  text: string;
  usage: UsageInfo;
  sessionId: string;
}

export interface GenerateObjectResponse {
  object: unknown;
  rawText: string;
  usage: UsageInfo;
  sessionId: string;
}

/**
 * Error codes used by the Claude Code wrapper.
 * Shared between ErrorResponse and ClaudeCliError for type safety.
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR"
  | "UNKNOWN_ERROR"
  | "TIMEOUT_ERROR"
  | "CLI_EXIT_ERROR"
  | "SPAWN_ERROR"
  | "PARSE_ERROR";

export interface ErrorResponse {
  error: string;
  code: ErrorCode;
  rawText?: string;
}

// Claude CLI output structure (from --output-format json)
export interface ClaudeCliOutput {
  type: "result" | "error";
  subtype?: string;
  result?: string;
  cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  is_error?: boolean;
  session_id?: string;
  num_turns?: number;
  total_tokens_in?: number;
  total_tokens_out?: number;
}
