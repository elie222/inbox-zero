import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  NEXT_PUBLIC_CONTACTS_ENABLED: true,
  NEXT_PUBLIC_GMAIL_OTHER_CONTACTS_ENABLED: false,
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

describe("Gmail scopes", () => {
  beforeEach(() => {
    envMock.NEXT_PUBLIC_CONTACTS_ENABLED = true;
    envMock.NEXT_PUBLIC_GMAIL_OTHER_CONTACTS_ENABLED = false;
    vi.resetModules();
  });

  it("requests saved contacts without Other Contacts by default", async () => {
    const { REQUIRED_SCOPES, SCOPES } = await import("./scopes");

    expect(SCOPES).toContain("https://www.googleapis.com/auth/contacts");
    expect(SCOPES).not.toContain(
      "https://www.googleapis.com/auth/contacts.other.readonly",
    );
    expect(REQUIRED_SCOPES).not.toContain(
      "https://www.googleapis.com/auth/contacts",
    );
    expect(REQUIRED_SCOPES).not.toContain(
      "https://www.googleapis.com/auth/contacts.other.readonly",
    );
  });

  it("requests Other Contacts only when that flag is enabled", async () => {
    envMock.NEXT_PUBLIC_GMAIL_OTHER_CONTACTS_ENABLED = true;
    const { SCOPES } = await import("./scopes");

    expect(SCOPES).toContain("https://www.googleapis.com/auth/contacts");
    expect(SCOPES).toContain(
      "https://www.googleapis.com/auth/contacts.other.readonly",
    );
  });

  it("does not request Other Contacts without contact suggestions", async () => {
    envMock.NEXT_PUBLIC_CONTACTS_ENABLED = false;
    envMock.NEXT_PUBLIC_GMAIL_OTHER_CONTACTS_ENABLED = true;
    const { SCOPES } = await import("./scopes");

    expect(SCOPES).not.toContain("https://www.googleapis.com/auth/contacts");
    expect(SCOPES).not.toContain(
      "https://www.googleapis.com/auth/contacts.other.readonly",
    );
  });
});
