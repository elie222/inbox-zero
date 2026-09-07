import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmail, createTestLogger } from "@/__tests__/helpers";
import type { EmailProvider } from "@/utils/email/types";
import { respondToCalendarInvitation } from "@/utils/calendar/respond-to-invitation";
import { findInvitationEvent } from "@/utils/calendar/invitation-provider";

vi.mock("@/utils/calendar/invitation-provider", () => ({
  findInvitationEvent: vi.fn(),
}));
const content =
  "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nUID:meeting@example.com\r\nDTSTART:20261001T100000Z\r\nORGANIZER:mailto:organizer@example.com\r\nATTENDEE:mailto:user@example.com\r\nEND:VEVENT\r\nEND:VCALENDAR";
const getMessage = vi.fn();
const getAttachment = vi.fn();
const sendEmail = vi.fn();
const emailProvider = {
  getMessage,
  getAttachment,
  sendEmail,
} as unknown as EmailProvider;
const params = {
  emailAccountId: "account",
  email: "user@example.com",
  emailProvider,
  messageId: "message",
  response: "accepted" as const,
  logger: createTestLogger(),
};

beforeEach(() => {
  vi.clearAllMocks();
  getMessage.mockResolvedValue({ ...getEmail(), calendarContent: content });
  vi.mocked(findInvitationEvent).mockResolvedValue(null);
});

describe("responding to calendar invitations", () => {
  it("sends an iMIP reply when no matching calendar is connected", async () => {
    await expect(respondToCalendarInvitation(params)).resolves.toEqual({
      response: "accepted",
      calendarSynced: false,
    });
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      to: "organizer@example.com",
      attachments: [
        { contentType: "text/calendar; method=REPLY; charset=UTF-8" },
      ],
    });
    expect(sendEmail.mock.calls[0][0].attachments[0].content).toContain(
      "METHOD:REPLY",
    );
  });

  it("updates a matched event without sending a duplicate reply email", async () => {
    const respondToInvitation = vi.fn();
    vi.mocked(findInvitationEvent).mockResolvedValue({
      event: { id: "event", response: null },
      provider: { respondToInvitation },
    } as unknown as NonNullable<
      Awaited<ReturnType<typeof findInvitationEvent>>
    >);
    await expect(respondToCalendarInvitation(params)).resolves.toEqual({
      response: "accepted",
      calendarSynced: true,
    });
    expect(respondToInvitation).toHaveBeenCalledOnce();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does not send an email fallback after a calendar write failure", async () => {
    vi.mocked(findInvitationEvent).mockResolvedValue({
      event: { id: "event", response: null },
      provider: {
        respondToInvitation: vi
          .fn()
          .mockRejectedValue(new Error("Provider unavailable")),
      },
    } as unknown as NonNullable<
      Awaited<ReturnType<typeof findInvitationEvent>>
    >);
    await expect(respondToCalendarInvitation(params)).rejects.toThrow(
      "Provider unavailable",
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("reads attachment data through the authenticated message", async () => {
    getMessage.mockResolvedValue({
      ...getEmail(),
      attachments: [
        {
          attachmentId: "attachment",
          filename: "invite.ics",
          mimeType: "text/calendar",
          size: content.length,
        },
      ],
    });
    getAttachment.mockResolvedValue({
      data: Buffer.from(content).toString("base64"),
      size: content.length,
    });
    await respondToCalendarInvitation(params);
    expect(getAttachment).toHaveBeenCalledWith("message", "attachment");
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("refuses invitations addressed to another attendee", async () => {
    await expect(
      respondToCalendarInvitation({ ...params, email: "other@example.com" }),
    ).rejects.toThrow("does not contain an invitation");
    expect(findInvitationEvent).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
