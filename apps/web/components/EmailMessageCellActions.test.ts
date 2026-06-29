import { describe, expect, it } from "vitest";
import { getEmailMessageCellActions } from "./EmailMessageCellActions";

describe("getEmailMessageCellActions", () => {
  it("shows Outlook actions and prefers the provider external URL", () => {
    expect(
      getEmailMessageCellActions({
        externalUrl:
          "https://outlook.office.com/mail/deeplink/read/outlook-message-1?ispopout=0",
        messageId: "outlook-message-1",
        provider: "microsoft",
        threadId: "outlook-thread-1",
        userEmail: "user@contoso.com",
      }),
    ).toEqual({
      openUrl:
        "https://outlook.office.com/mail/deeplink/read/outlook-message-1?ispopout=0",
    });
  });

  it("falls back to the provider URL when Outlook has no external URL", () => {
    expect(
      getEmailMessageCellActions({
        messageId: "outlook-message-1",
        provider: "microsoft",
        threadId: "outlook-thread-1",
        userEmail: "user@contoso.com",
      }),
    ).toEqual({
      openUrl: "https://outlook.office.com/mail/inbox/id/outlook-message-1",
    });
  });

  it("hides actions when the email cell requests it", () => {
    expect(
      getEmailMessageCellActions({
        hideViewEmailButton: true,
        messageId: "message-1",
        provider: "google",
        threadId: "thread-1",
        userEmail: "user@gmail.com",
      }),
    ).toBeNull();
  });
});
