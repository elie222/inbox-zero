import { describe, expect, it } from "vitest";
import { getEmail } from "@/__tests__/helpers";
import { isCalendarInvitationMessage } from "@/utils/calendar/invitations/detection";

describe("invitation eligibility", () => {
  it("skips sent invitations before making provider requests", () => {
    expect(
      isCalendarInvitationMessage({
        ...getEmail(),
        labelIds: ["SENT"],
        isMeetingInvitation: true,
      }),
    ).toBe(false);
  });

  it("rejects excessive calendar attachments even on native meeting messages", () => {
    const attachment = {
      attachmentId: "attachment",
      filename: "invite.ics",
      mimeType: "text/calendar",
      size: 100,
      headers: {
        "content-description": "",
        "content-id": "",
        "content-transfer-encoding": "base64",
        "content-type": "text/calendar",
      },
    };
    expect(
      isCalendarInvitationMessage({
        ...getEmail(),
        isMeetingInvitation: true,
        attachments: [attachment, attachment, attachment],
      }),
    ).toBe(false);
  });

  it("shows a request with inline calendar metadata and no downloadable attachment", () => {
    expect(
      isCalendarInvitationMessage({ ...getEmail(), isMeetingInvitation: true }),
    ).toBe(true);
  });
});
