import { Router, type Request, type Response } from "express";
import { executeClaudeCli, ClaudeCliError } from "../cli.js";
import { logger } from "../logger.js";
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

    const { prompt, system, sessionId, maxTokens, model, userEmail } =
      parseResult.data;

    logger.info("generate-text", {
      model: model || "default",
      hasSystem: !!system,
      promptLength: prompt.length,
    });

    try {
      const result = await executeClaudeCli({
        prompt,
        system,
        sessionId,
        maxTokens,
        model,
        userEmail,
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

    const { prompt, system, schema, sessionId, maxTokens, model, userEmail } =
      parseResult.data;

    logger.info("generate-object", {
      model: model || "default",
      hasSystem: !!system,
      promptLength: prompt.length,
    });

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
        model,
        userEmail,
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

  // Try to find JSON object in the response using non-greedy global match
  // Iterate through candidates to handle cases like `{"a":1} text {"b":2}`
  const objectMatches = text.match(/\{[\s\S]*?\}/g);
  if (objectMatches) {
    for (const match of objectMatches) {
      try {
        return JSON.parse(match);
      } catch {
        // Try next candidate
      }
    }
  }

  // Try to find JSON array in the response using non-greedy global match
  const arrayMatches = text.match(/\[[\s\S]*?\]/g);
  if (arrayMatches) {
    for (const match of arrayMatches) {
      try {
        return JSON.parse(match);
      } catch {
        // Try next candidate
      }
    }
  }

  // Don't include raw response text in error - may contain sensitive data
  throw new Error("Failed to parse JSON from response");
}

/**
 * Handles CLI errors and sends appropriate HTTP response.
 */
function handleCliError(error: unknown, res: Response<ErrorResponse>): void {
  if (error instanceof ClaudeCliError) {
    // Don't include rawOutput in response - may contain sensitive data
    res.status(500).json({
      error: error.message,
      code: error.code,
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
