import { describe, expect, it } from "vitest";
import { hasGoogleScope } from "@/utils/gmail/scopes";

describe("hasGoogleScope", () => {
  it("accepts full contacts access when read-only contacts access is required", () => {
    expect(
      hasGoogleScope(
        ["https://www.googleapis.com/auth/contacts"],
        "https://www.googleapis.com/auth/contacts.readonly",
      ),
    ).toBe(true);
  });
});
