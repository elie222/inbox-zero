/**
 * Converts mention format @[LABEL] to just LABEL for AI processing
 * This strips the special markdown format used by the editor so the AI
 * receives clean label names without the mention syntax
 */
export function convertMentionsToLabels(promptFile: string): string {
  return processMentions(promptFile, (match) => match);
}

/**
 * Converts @[LABEL] format to "LABEL" for display in the UI
 * This is the inverse of convertMentionsToLabels
 */
export function convertLabelsToDisplay(text: string): string {
  return processMentions(text, (match) => `"${match}"`);
}

/**
 * Helper function to process mentions with proper bracket matching
 */
function processMentions(
  text: string,
  transformer: (match: string) => string,
): string {
  let result = "";
  let i = 0;

  while (i < text.length) {
    // Look for @[
    if (i < text.length - 1 && text[i] === "@" && text[i + 1] === "[") {
      // Found start of mention, find the matching closing bracket
      let bracketCount = 1;
      let j = i + 2;

      while (j < text.length && bracketCount > 0) {
        if (text[j] === "[") {
          bracketCount++;
        } else if (text[j] === "]") {
          bracketCount--;
        }
        j++;
      }

      if (bracketCount === 0) {
        // Found matching closing bracket
        const labelContent = text.slice(i + 2, j - 1);
        result += transformer(labelContent);
        i = j;
      } else {
        // No matching bracket found, treat as regular text
        result += text[i];
        i++;
      }
    } else {
      result += text[i];
      i++;
    }
  }

  return result;
}
