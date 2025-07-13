/**
 * Converts mention format @[LABEL] to just LABEL for AI processing
 * This strips the special markdown format used by the editor so the AI
 * receives clean label names without the mention syntax
 */
export function convertMentionsToLabels(promptFile: string): string {
  return promptFile.replace(/@\[([^\]]+)\]/g, "$1");
}
