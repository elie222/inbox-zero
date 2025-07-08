import type { ParsedMessage } from "@/utils/types";

/**
 * Creates a simplified display value for email data in chat input
 * Shows "@(Subject)" format while keeping full data under the hood
 */
export function createEmailDisplayValue(message: ParsedMessage): string {
  const subject = message.headers.subject || "No subject";
  return `@(${subject})`;
}

/**
 * Checks if the input contains email data that should be displayed in simplified format
 */
export function hasEmailData(input: string): boolean {
  // Check if input contains email-related patterns
  return (
    input.includes("*From*:") ||
    input.includes("*Subject*:") ||
    input.includes("*Content*:") ||
    input.includes("Email details:") ||
    input.includes("Current rule applied:")
  );
}

/**
 * Extracts the subject from email data input for display purposes
 */
export function extractSubjectFromInput(input: string): string | null {
  const subjectMatch = input.match(/\*Subject\*:\s*(.+?)(?:\n|$)/);
  return subjectMatch ? subjectMatch[1].trim() : null;
}

/**
 * Creates a display value for email-related input
 * Replaces the email details section with a simplified version
 */
export function createDisplayValueForInput(input: string): string | undefined {
  if (!hasEmailData(input)) {
    return undefined; // Use original input
  }

  const subject = extractSubjectFromInput(input);
  if (!subject) {
    return input; // Keep original if no subject found
  }

  // Replace the email details section with simplified version
  const emailDetailsPattern =
    /Email details:\s*\*From\*:[\s\S]*?\*Content\*:[\s\S]*?(?=\n\n|\nCurrent rule|$)/;
  const replacement = `Email details:\n📧 [${subject}]`;

  const displayValue = input.replace(emailDetailsPattern, replacement);

  return displayValue;
}

/**
 * Extracts the full email content for tooltip display
 */
export function extractEmailContentForTooltip(input: string): string | null {
  if (!hasEmailData(input)) {
    return null;
  }

  const emailDetailsMatch = input.match(
    /Email details:\s*\*From\*:([\s\S]*?)(?=\n\n|\nCurrent rule|$)/,
  );
  if (!emailDetailsMatch) {
    return null;
  }

  const emailDetails = emailDetailsMatch[1].trim();

  // Format the email details nicely for the tooltip
  const fromMatch = emailDetails.match(/\*From\*:\s*(.+?)(?:\n|$)/);
  const subjectMatch = emailDetails.match(/\*Subject\*:\s*(.+?)(?:\n|$)/);
  const contentMatch = emailDetails.match(
    /\*Content\*:\s*([\s\S]*?)(?:\n\*|$)/,
  );

  if (!fromMatch || !subjectMatch || !contentMatch) {
    return null;
  }

  return `From: ${fromMatch[1].trim()}\nSubject: ${subjectMatch[1].trim()}\nContent: ${contentMatch[1].trim()}`;
}
