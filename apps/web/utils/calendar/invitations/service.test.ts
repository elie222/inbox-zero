import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmail, createTestLogger } from "@/__tests__/helpers";
import type { EmailProvider } from "@/utils/email/types";
import {
  getCalendarInvitation,
  respondToCalendarInvitation,
} from "@/utils/calendar/invitations/service";
const mocks = vi.hoisted(() => ({
  connections: vi.fn(),
  findEvent: vi.fn(),
  respond: vi.fn(),
}));
vi.mock("@/utils/prisma", () => ({
  default: { calendarConnection: { findMany: mocks.connections } },
}));
vi.mock("@/utils/calendar/event-provider", () => ({
  createCalendarEventProvider: () => ({
    findInvitationEvent: mocks.findEvent,
    respondToInvitation: mocks.respond,
  }),
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
  mocks.connections.mockResolvedValue([]);
  mocks.findEvent.mockResolvedValue({ id: "event", response: null });
  mocks.respond.mockResolvedValue(undefined);
});

describe("responding to calendar invitations", () => {
  it("uses email fallback when the calendar has no refresh token", async () => {
    mocks.connections.mockResolvedValue([
      { provider: "google", refreshToken: null },
    ]);
    await expect(respondToCalendarInvitation(params)).resolves.toEqual({
      response: "accepted",
      calendarSynced: false,
    });
    expect(mocks.findEvent).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("skips unusable calendar credentials before checking a usable connection", async () => {
    mocks.connections.mockResolvedValue([
      { provider: "google", refreshToken: null },
      { provider: "microsoft", refreshToken: "refresh" },
    ]);
    await expect(respondToCalendarInvitation(params)).resolves.toEqual({
      response: "accepted",
      calendarSynced: true,
    });
    expect(mocks.findEvent).toHaveBeenCalledOnce();
    expect(sendEmail).not.toHaveBeenCalled();
  });

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
    mocks.connections.mockResolvedValue([
      { provider: "google", refreshToken: "refresh" },
    ]);
    await expect(respondToCalendarInvitation(params)).resolves.toEqual({
      response: "accepted",
      calendarSynced: true,
    });
    expect(mocks.respond).toHaveBeenCalledOnce();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does not send an email fallback after a calendar write failure", async () => {
    mocks.connections.mockResolvedValue([
      { provider: "google", refreshToken: "refresh" },
    ]);
    mocks.respond.mockRejectedValue(new Error("Provider unavailable"));
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
    expect(mocks.connections).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("loading calendar invitations", () => {
  it("returns the current calendar response without exposing raw invitation data", async () => {
    mocks.connections.mockResolvedValue([
      { provider: "google", refreshToken: "refresh" },
    ]);
    mocks.findEvent.mockResolvedValue({ id: "event", response: "accepted" });
    expect(await getCalendarInvitation(params)).toEqual({
      invitation: {
        title: "Calendar invitation",
        organizer: "organizer@example.com",
        recurring: false,
        response: "accepted",
        calendarSynced: true,
      },
    });
    expect(mocks.connections).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account",
        isConnected: true,
        email: { equals: "user@example.com", mode: "insensitive" },
      },
    });
  });

  it("rejects ambiguous calendar matches without sending a response", async () => {
    mocks.connections.mockResolvedValue([
      { provider: "google", refreshToken: "refresh" },
      { provider: "microsoft", refreshToken: "refresh" },
    ]);
    await expect(respondToCalendarInvitation(params)).rejects.toThrow(
      "multiple calendars",
    );
    expect(mocks.respond).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
