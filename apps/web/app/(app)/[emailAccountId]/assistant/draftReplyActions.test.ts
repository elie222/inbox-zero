import { describe, expect, it } from "vitest";
import { ActionType } from "@/generated/prisma/enums";
import {
  buildVisibleDraftReplyGroups,
  denormalizeDraftReplyActions,
  getDraftReplyDelivery,
  getDraftReplyMessagingChannelIds,
  normalizeDraftReplyActions,
} from "@/app/(app)/[emailAccountId]/assistant/draftReplyActions";

describe("draftReplyActions", () => {
  it("normalizes legacy messaging-targeted mailbox drafts to chat drafts", () => {
    const actions = normalizeDraftReplyActions([
      {
        type: ActionType.DRAFT_EMAIL,
        messagingChannelId: "cmessagingchannel1234567890123",
      },
    ]);

    expect(actions).toEqual([
      expect.objectContaining({
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
        messagingChannelId: "cmessagingchannel1234567890123",
      }),
    ]);
  });

  it("denormalizes all adjacent draft messaging actions with the email content", () => {
    const actions = denormalizeDraftReplyActions([
      {
        type: ActionType.DRAFT_EMAIL,
        subject: { value: "Re: hello" },
        content: { value: "Thanks for the note.", setManually: true },
        to: { value: "reply@example.com" },
        cc: { value: "cc@example.com" },
        staticAttachments: [
          {
            driveConnectionId: "drive-1",
            name: "brief.pdf",
            sourceId: "file-1",
            sourcePath: "/Docs",
            type: "FILE",
          },
        ],
      },
      {
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
        messagingChannelId: "cmessagingchannel1234567890123",
      },
      {
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
        messagingChannelId: "cmessagingchannel1234567890456",
      },
    ]);

    expect(actions[0]).toEqual(
      expect.objectContaining({
        type: ActionType.DRAFT_EMAIL,
        messagingChannelId: null,
      }),
    );
    expect(actions[1]).toEqual(
      expect.objectContaining({
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
        messagingChannelId: "cmessagingchannel1234567890123",
        subject: { value: "Re: hello" },
        content: { value: "Thanks for the note.", setManually: true },
        to: { value: "reply@example.com" },
        cc: { value: "cc@example.com" },
      }),
    );
    expect(actions[2]).toEqual(
      expect.objectContaining({
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
        messagingChannelId: "cmessagingchannel1234567890456",
        subject: { value: "Re: hello" },
        content: { value: "Thanks for the note.", setManually: true },
        to: { value: "reply@example.com" },
        cc: { value: "cc@example.com" },
      }),
    );
  });

  it("collapses adjacent email and chat draft actions into one visible draft card", () => {
    const groups = buildVisibleDraftReplyGroups([
      { type: ActionType.LABEL },
      { type: ActionType.DRAFT_EMAIL },
      {
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
        messagingChannelId: "cmessagingchannel1234567890123",
      },
      {
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
        messagingChannelId: "cmessagingchannel1234567890456",
      },
    ]);

    expect(groups).toEqual([
      {
        primaryIndex: 0,
        draftMessagingIndexes: [],
        actionType: ActionType.LABEL,
      },
      {
        primaryIndex: 1,
        draftMessagingIndexes: [2, 3],
        actionType: ActionType.DRAFT_EMAIL,
      },
    ]);
  });

  it("keeps messaging-only draft groups in sync across every destination", () => {
    const actions = denormalizeDraftReplyActions([
      {
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
        messagingChannelId: "cmessagingchannel1234567890123",
        content: { value: "Thanks for the note.", setManually: true },
      },
      {
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
        messagingChannelId: "cmessagingchannel1234567890456",
      },
    ]);

    expect(actions[1]).toEqual(
      expect.objectContaining({
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
        messagingChannelId: "cmessagingchannel1234567890456",
        content: { value: "Thanks for the note.", setManually: true },
      }),
    );
  });

  it("reports the current draft delivery mode for email, chat, and both", () => {
    expect(
      getDraftReplyDelivery({
        primaryAction: { type: ActionType.DRAFT_EMAIL },
      }),
    ).toBe("EMAIL");

    expect(
      getDraftReplyDelivery({
        primaryAction: {
          type: ActionType.DRAFT_MESSAGING_CHANNEL,
          messagingChannelId: "cmessagingchannel1234567890123",
        },
      }),
    ).toBe("MESSAGING");

    expect(
      getDraftReplyDelivery({
        primaryAction: { type: ActionType.DRAFT_EMAIL },
        draftMessagingActions: [
          {
            type: ActionType.DRAFT_MESSAGING_CHANNEL,
            messagingChannelId: "cmessagingchannel1234567890123",
          },
        ],
      }),
    ).toBe("EMAIL_AND_MESSAGING");

    expect(
      getDraftReplyDelivery({
        primaryAction: {
          type: ActionType.DRAFT_MESSAGING_CHANNEL,
          messagingChannelId: "cmessagingchannel1234567890123",
        },
        draftMessagingActions: [
          {
            type: ActionType.DRAFT_MESSAGING_CHANNEL,
            messagingChannelId: "cmessagingchannel1234567890456",
          },
        ],
      }),
    ).toBe("MESSAGING");

    expect(
      getDraftReplyDelivery({
        primaryAction: {
          type: ActionType.DRAFT_MESSAGING_CHANNEL,
          messagingChannelId: null,
        },
      }),
    ).toBe("EMAIL");
  });

  it("returns every selected draft messaging channel id in order without duplicates", () => {
    expect(
      getDraftReplyMessagingChannelIds({
        primaryAction: {
          type: ActionType.DRAFT_EMAIL,
        },
        draftMessagingActions: [
          {
            type: ActionType.DRAFT_MESSAGING_CHANNEL,
            messagingChannelId: "cmessagingchannel1234567890123",
          },
          {
            type: ActionType.DRAFT_MESSAGING_CHANNEL,
            messagingChannelId: "cmessagingchannel1234567890456",
          },
          {
            type: ActionType.DRAFT_MESSAGING_CHANNEL,
            messagingChannelId: "cmessagingchannel1234567890123",
          },
        ],
      }),
    ).toEqual([
      "cmessagingchannel1234567890123",
      "cmessagingchannel1234567890456",
    ]);
  });
});
