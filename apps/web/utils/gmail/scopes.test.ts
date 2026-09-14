import { describe, expect, it, vi } from "vitest";
import { REQUIRED_SCOPES, SCOPES } from "./scopes";

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_CONTACTS_ENABLED: true },
}));

describe("Gmail scopes", () => {
  it("requests both contact sources when suggestions are enabled", () => {
    expect(SCOPES).toContain("https://www.googleapis.com/auth/contacts");
    expect(SCOPES).toContain(
      "https://www.googleapis.com/auth/contacts.other.readonly",
    );
  });

  it("keeps contact access optional so existing accounts stay connected", () => {
    expect(REQUIRED_SCOPES).not.toContain(
      "https://www.googleapis.com/auth/contacts",
    );
    expect(REQUIRED_SCOPES).not.toContain(
      "https://www.googleapis.com/auth/contacts.other.readonly",
    );
  });
});
