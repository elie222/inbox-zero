import { describe, expect, it } from "vitest";
import { getMailAccountUrl } from "@/app/(app)/[emailAccountId]/mail/mail-account-url";

describe("getMailAccountUrl", () => {
  it("clears account-scoped selections while preserving shared mail preferences", () => {
    const url = new URL(
      getMailAccountUrl(
        "next-account",
        "?accountScope=all&thread-id=thread&thread-account-id=previous-account&side-panel-thread-id=thread&labelId=label&type=label&layout=list&q=receipt",
      ),
      "https://example.com",
    );
    expect(url.pathname).toBe("/next-account/mail");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      layout: "list",
      q: "receipt",
    });
  });

  it("clears folder filters but keeps built-in views when no account filter is set", () => {
    expect(
      getMailAccountUrl("next-account", "?folderId=folder&type=folder"),
    ).toBe("/next-account/mail");
    expect(getMailAccountUrl("next-account", "?type=sent")).toBe(
      "/next-account/mail?type=sent",
    );
  });

  it("switches accounts without adding an empty query string", () => {
    expect(getMailAccountUrl("next-account", "")).toBe("/next-account/mail");
  });
});
