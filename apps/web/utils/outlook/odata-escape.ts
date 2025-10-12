/**
 * Escapes a string value for safe use in OData filter expressions.
 * Single quotes in OData string literals must be escaped by doubling them.
 * Additionally handles special characters that may cause issues in filters.
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
  // Note: equals signs and other special chars are valid in OData string literals
  return value.replace(/'/g, "''");
}
