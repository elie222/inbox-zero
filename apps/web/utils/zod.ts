import { z } from "zod";

// to avoid "false" being parsed as `true`
// https://github.com/colinhacks/zod/issues/1630
export const zodTrueFalse = z
  .enum(["true", "false"])
  .nullish()
  .transform((v) => v === "true");

/**
 * Preprocessor for Zod schemas to gracefully handle string inputs
 * that represent boolean values (e.g., "true", "yes", "false", "no").
 * Converts these strings to booleans before validation.
 * Passes through actual booleans or other types for Zod's default handling.
 */
export const preprocessBooleanLike = (val: unknown): unknown => {
  if (typeof val === "string") {
    const lowerVal = val.toLowerCase().trim();
    if (lowerVal === "true" || lowerVal === "yes") return true;
    if (lowerVal === "false" || lowerVal === "no") return false;
  }
  return val;
};
