import { Router, type Request, type Response } from "express";
import { executeClaudeCli, ClaudeCliError } from "../cli.js";
import {
  generateTextRequestSchema,
  generateObjectRequestSchema,
  type GenerateTextResponse,
  type GenerateObjectResponse,
  type ErrorResponse,
} from "../types.js";

const router = Router();

/**
 * POST /generate-text
 *
 * Generates plain text response from Claude CLI.
 */
router.post(
  "/generate-text",
  async (req: Request, res: Response<GenerateTextResponse | ErrorResponse>) => {
    const parseResult = generateTextRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: "Invalid request body",
        code: "VALIDATION_ERROR",
        rawText: JSON.stringify(parseResult.error.issues),
      });
      return;
    }

    const { prompt, system, sessionId, maxTokens } = parseResult.data;

    try {
      const result = await executeClaudeCli({
        prompt,
        system,
        sessionId,
        maxTokens,
      });

      res.json({
        text: result.text,
        usage: result.usage,
        sessionId: result.sessionId,
      });
    } catch (error) {
      handleCliError(error, res);
    }
  },
);

/**
 * POST /generate-object
 *
 * Generates structured JSON response from Claude CLI.
 * The schema is passed in the request to instruct Claude to output valid JSON.
 */
router.post(
  "/generate-object",
  async (
    req: Request,
    res: Response<GenerateObjectResponse | ErrorResponse>,
  ) => {
    const parseResult = generateObjectRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: "Invalid request body",
        code: "VALIDATION_ERROR",
        rawText: JSON.stringify(parseResult.error.issues),
      });
      return;
    }

    const { prompt, system, schema, sessionId, maxTokens } = parseResult.data;

    // Build enhanced prompt that instructs Claude to output JSON matching schema
    const schemaString = JSON.stringify(schema, null, 2);
    const enhancedPrompt = `${prompt}

IMPORTANT: You MUST respond with ONLY valid JSON that matches this schema. No markdown, no explanations, just the JSON object.

JSON Schema:
${schemaString}`;

    const enhancedSystem = system
      ? `${system}\n\nYou are a JSON generator. Always respond with valid JSON matching the provided schema.`
      : "You are a JSON generator. Always respond with valid JSON matching the provided schema.";

    try {
      const result = await executeClaudeCli({
        prompt: enhancedPrompt,
        system: enhancedSystem,
        sessionId,
        maxTokens,
      });

      // Parse the JSON response
      const parsedObject = parseJsonResponse(result.text);

      res.json({
        object: parsedObject,
        rawText: result.text,
        usage: result.usage,
        sessionId: result.sessionId,
      });
    } catch (error) {
      handleCliError(error, res);
    }
  },
);

/**
 * Attempts to parse JSON from Claude's response.
 * Handles common edge cases like markdown code blocks.
 */
function parseJsonResponse(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Continue to fallback strategies
  }

  // Strip markdown code blocks if present
  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    try {
      return JSON.parse(jsonBlockMatch[1].trim());
    } catch {
      // Continue to next strategy
    }
  }

  // Try to find JSON object in the response
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      // Fall through to error
    }
  }

  // Try to find JSON array in the response
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch {
      // Fall through to error
    }
  }

  throw new Error(`Failed to parse JSON from response: ${text.slice(0, 200)}`);
}

/**
 * Handles CLI errors and sends appropriate HTTP response.
 */
function handleCliError(error: unknown, res: Response<ErrorResponse>): void {
  if (error instanceof ClaudeCliError) {
    res.status(500).json({
      error: error.message,
      code: error.code,
      rawText: error.rawOutput,
    });
    return;
  }

  if (error instanceof Error) {
    res.status(500).json({
      error: error.message,
      code: "INTERNAL_ERROR",
    });
    return;
  }

  res.status(500).json({
    error: "Unknown error occurred",
    code: "UNKNOWN_ERROR",
  });
}

export default router;
