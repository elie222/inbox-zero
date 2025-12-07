import { z } from "zod";

// Parses boolean env vars: "false" → false, any other value → true, unset → uses .default()
export const booleanString = z.preprocess((val) => {
  if (!val) return undefined;
  if (String(val).toLowerCase() === "false") return false;
  return true;
}, z.boolean().optional());

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
