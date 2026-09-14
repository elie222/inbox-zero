import { describe, expect, it } from "vitest";
import {
  expandSnippetContent,
  snippetContentToHtml,
  snippetVariablesFromRecipient,
} from "./expand-snippet";

describe("snippetVariablesFromRecipient", () => {
  it("uses the first recipient's display name and email", () => {
    expect(
      snippetVariablesFromRecipient(
        "Alex Rivera <alex@example.com>, Sam Lee <sam@example.com>",
      ),
    ).toEqual({
      email: "alex@example.com",
      firstName: "Alex",
      name: "Alex Rivera",
    });
  });

  it("falls back to the local-part when only an address is present", () => {
    expect(snippetVariablesFromRecipient("alex@example.com")).toEqual({
      email: "alex@example.com",
      firstName: "alex",
    });
  });

  it("returns nothing when no recipient is present", () => {
    expect(snippetVariablesFromRecipient("")).toEqual({});
    expect(snippetVariablesFromRecipient()).toEqual({});
  });
});

describe("expandSnippetContent", () => {
  it("replaces known placeholders from the recipient", () => {
    expect(
      expandSnippetContent("Hi {first_name}, this is for {email}.", {
        email: "alex@example.com",
        firstName: "Alex",
        name: "Alex Rivera",
      }),
    ).toBe("Hi Alex, this is for alex@example.com.");
  });

  it("leaves unknown or empty placeholders in place", () => {
    expect(
      expandSnippetContent("Hi {first_name}, {topic}.", {
        firstName: "Alex",
      }),
    ).toBe("Hi Alex, {topic}.");
    expect(expandSnippetContent("Hi {first_name}.", {})).toBe(
      "Hi {first_name}.",
    );
  });
});

describe("snippetContentToHtml", () => {
  it("turns paragraphs into escaped HTML after expanding placeholders", () => {
    expect(
      snippetContentToHtml("Hi {first_name},\n\nSee you <soon>.", {
        firstName: "Alex",
      }),
    ).toBe("<p>Hi Alex,</p><p>See you &lt;soon&gt;.</p>");
  });
});
