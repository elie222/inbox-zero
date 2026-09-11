import { describe, expect, it, vi } from "vitest";
import { REQUIRED_SCOPES, SCOPES } from "./scopes";

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_CONTACTS_ENABLED: true,
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: false,
  },
}));

describe("Outlook scopes", () => {
  it("requests both contact sources when suggestions are enabled", () => {
    expect(SCOPES).toContain("Contacts.Read");
    expect(SCOPES).toContain("People.Read");
  });

  it("keeps contact access optional so existing accounts stay connected", () => {
    expect(REQUIRED_SCOPES).not.toContain("Contacts.Read");
    expect(REQUIRED_SCOPES).not.toContain("People.Read");
  });
});
