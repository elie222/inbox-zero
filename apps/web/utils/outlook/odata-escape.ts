/**
 * Escapes a string value for safe use in OData filter expressions.
 * Single quotes in OData string literals must be escaped by doubling them.
 *
 * @param value The string value to escape
 * @returns The escaped string safe for OData filter interpolation
 *
 * @example
 * escapeODataString("O'Brien") // returns "O''Brien"
 * escapeODataString("test' or 1=1 --") // returns "test'' or 1=1 --"
 */
export function escapeODataString(value: string): string {
  if (typeof value !== "string") {
    return "";
  }
  // Replace single quotes with doubled single quotes
  return value.replace(/'/g, "''");
}
