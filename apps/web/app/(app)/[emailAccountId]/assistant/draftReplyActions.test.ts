import { describe, expect, it } from "vitest";
import { ActionType } from "@/generated/prisma/enums";
import {
  buildVisibleDraftReplyGroups,
  denormalizeDraftReplyActions,
  getDraftReplyDelivery,
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

  it("denormalizes paired draft actions by syncing the messaging companion fields", () => {
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
  });

  it("collapses adjacent email and chat draft actions into one visible draft card", () => {
    const groups = buildVisibleDraftReplyGroups([
      { type: ActionType.LABEL },
      { type: ActionType.DRAFT_EMAIL },
      {
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
        messagingChannelId: "cmessagingchannel1234567890123",
      },
    ]);

    expect(groups).toEqual([
      {
        primaryIndex: 0,
        draftMessagingIndex: null,
        actionType: ActionType.LABEL,
      },
      {
        primaryIndex: 1,
        draftMessagingIndex: 2,
        actionType: ActionType.DRAFT_EMAIL,
      },
    ]);
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
        draftMessagingAction: {
          type: ActionType.DRAFT_MESSAGING_CHANNEL,
          messagingChannelId: "cmessagingchannel1234567890123",
        },
      }),
    ).toBe("EMAIL_AND_MESSAGING");
  });
});
