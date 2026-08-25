import { describe, expect, it, vi } from "vitest";
import { REQUIRED_SCOPES, SCOPES } from "./scopes";

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_CONTACTS_ENABLED: true,
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: false,
  },
}));

describe("Outlook scopes", () => {
  it("requests read access to saved contacts when suggestions are enabled", () => {
    expect(REQUIRED_SCOPES).not.toContain("Contacts.Read");
    expect(SCOPES).toContain("Contacts.Read");
  });
});
