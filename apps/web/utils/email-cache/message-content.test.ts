import { describe, expect, it } from "vitest";
import { getMockMessage } from "@/__tests__/helpers";
import { isCalendarInvitationMessage } from "@/utils/calendar/invitations/detection";
import type { ParsedMessage } from "@/utils/types";
import { sanitizeCachedMailMessage } from "./message-content";

describe("cached mail sanitisation", () => {
  // Both directions matter: the flag can be the only thing marking a message as
  // an invitation, and the only thing ruling one out despite an .ics part.
  it.each([
    { isMeetingInvitation: true, attachments: [] },
    { isMeetingInvitation: false, attachments: [calendarAttachment()] },
  ])("keeps a reloaded message's calendar-invitation verdict stable (%o)", (overrides) => {
    const message = { ...getMockMessage(), ...overrides } as ParsedMessage;
    expect(
      isCalendarInvitationMessage(sanitizeCachedMailMessage(message)),
    ).toBe(isCalendarInvitationMessage(message));
  });
});

function calendarAttachment() {
  return {
    attachmentId: "invite",
    filename: "invite.ics",
    mimeType: "text/calendar",
    size: 1,
    headers: {
      "content-description": "",
      "content-disposition": "",
      "content-id": "",
      "content-transfer-encoding": "",
      "content-type": "text/calendar",
    },
  };
}
