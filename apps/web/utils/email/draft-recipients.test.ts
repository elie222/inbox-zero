import { expect, it } from "vitest";
import { completeDraftRecipients } from "./draft-recipients";

it.each([
  "person@example.com",
  "Jane Doe <jane@example.com>",
  '"Doe, Jane" <jane@example.com>',
  '"Jane \\"JJ\\" Doe" <jane@example.com>',
  "Élodie <elodie@example.com>",
  "<person@example.com>",
])("preserves the complete recipient %s", (recipient) => {
  expect(completeDraftRecipients(recipient)).toBe(recipient);
});

it("rejects long malformed input without extracting address substrings", () => {
  for (const malformed of [
    "a!".repeat(50_000),
    `${"a@".repeat(50_000)}example.com`,
  ]) {
    expect(completeDraftRecipients(malformed)).toBe("");
    expect(completeDraftRecipients(`<${malformed}>`)).toBe("");
  }
});
