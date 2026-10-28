import {
  extractEmailAddress,
  extractNameFromEmail,
  splitRecipientList,
} from "@/utils/email";
import { textToHtmlParagraphs } from "@/utils/string";

export type SnippetVariables = {
  email?: string;
  firstName?: string;
  name?: string;
};

const TOKEN_TO_VARIABLE: Record<string, keyof SnippetVariables> = {
  email: "email",
  first_name: "firstName",
  name: "name",
};

export function snippetVariablesFromRecipient(
  recipientList?: string,
): SnippetVariables {
  const firstRecipient = splitRecipientList(recipientList ?? "")[0];
  if (!firstRecipient) return {};

  const email = extractEmailAddress(firstRecipient);
  const extractedName = extractNameFromEmail(firstRecipient);
  const name = displayNameFromExtracted(extractedName);
  const firstName = firstNameFromDisplay(name, email);

  return {
    email: email || undefined,
    firstName: firstName || undefined,
    name: name || undefined,
  };
}

export function expandSnippetContent(
  content: string,
  variables: SnippetVariables,
): string {
  return content.replace(/\{([a-z_]+)\}/gi, (match, token: string) => {
    const key = TOKEN_TO_VARIABLE[token.toLowerCase()];
    if (!key) return match;
    const value = variables[key]?.trim();
    return value || match;
  });
}

export function snippetContentToHtml(
  content: string,
  variables: SnippetVariables,
): string {
  return textToHtmlParagraphs(expandSnippetContent(content, variables));
}

function displayNameFromExtracted(extractedName: string): string {
  if (!extractedName || extractedName.includes("@")) return "";
  return extractedName;
}

function firstNameFromDisplay(name: string, email: string): string {
  if (name) return name.split(/\s+/)[0] ?? "";
  return email.split("@")[0] ?? "";
}
