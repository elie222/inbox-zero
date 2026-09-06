import { describe, expect, it } from "vitest";
import { ActionType } from "@/generated/prisma/enums";
import {
  buildPersistedRuleActions,
  getRuleFormActionState,
} from "@/app/(app)/[emailAccountId]/assistant/ruleFormActions";

describe("rule form action conversion", () => {
  it("round-trips reordered action delays by identity", () => {
    const originalActions = [
      {
        id: "action-draft",
        type: ActionType.DRAFT_EMAIL,
        content: { value: "Thanks" },
        delayInMinutes: 30,
      },
      {
        id: "action-label",
        type: ActionType.LABEL,
        labelId: { value: "label-1", name: "Follow up" },
      },
    ];

    const state = getRuleFormActionState({
      actions: originalActions,
      webhookActionsEnabled: true,
    });
    expect(state.actions.map((action) => action.id)).toEqual([
      "action-label",
      "action-draft",
    ]);

    const persistedActions = buildPersistedRuleActions({
      formActions: state.actions,
      originalActions,
      includeDigestAction: false,
      notifyMessagingChannelId: null,
      webhookActionsEnabled: true,
    });

    expect(persistedActions).toEqual([
      expect.objectContaining({
        id: "action-draft",
        type: ActionType.DRAFT_EMAIL,
        delayInMinutes: 30,
      }),
      expect.objectContaining({
        id: "action-label",
        type: ActionType.LABEL,
      }),
    ]);
    expect(persistedActions[1]).not.toHaveProperty("delayInMinutes");
  });

  it("preserves special, hidden, and multi-destination actions in persisted order", () => {
    const originalActions = [
      {
        id: "action-telegram",
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
        messagingChannelId: "cmessagingchannel1234567890456",
        content: { value: "Draft response" },
        delayInMinutes: 45,
      },
      { id: "action-digest", type: ActionType.DIGEST },
      {
        id: "action-email",
        type: ActionType.DRAFT_EMAIL,
        content: { value: "Draft response" },
        subject: { value: "Re: update" },
        delayInMinutes: 45,
      },
      {
        id: "action-notify",
        type: ActionType.NOTIFY_MESSAGING_CHANNEL,
        messagingChannelId: "cmessagingchannel1234567890123",
      },
      {
        id: "action-slack",
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
        messagingChannelId: "cmessagingchannel1234567890123",
        content: { value: "Draft response" },
        delayInMinutes: 45,
      },
      {
        id: "action-webhook",
        type: ActionType.CALL_WEBHOOK,
        url: { value: "https://example.com/hook" },
      },
    ];

    const state = getRuleFormActionState({
      actions: originalActions,
      webhookActionsEnabled: false,
    });
    const persistedActions = buildPersistedRuleActions({
      formActions: state.actions,
      originalActions,
      includeDigestAction: state.digest,
      notifyMessagingChannelId: state.notifyMessagingChannelId,
      webhookActionsEnabled: false,
    });

    expect(state.actions.map((action) => action.id)).toEqual([
      "action-email",
      "action-telegram",
      "action-slack",
    ]);
    expect(persistedActions.map((action) => action.id)).toEqual(
      originalActions.map((action) => action.id),
    );
    expect(persistedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "action-telegram",
          messagingChannelId: "cmessagingchannel1234567890456",
          delayInMinutes: 45,
        }),
        expect.objectContaining({
          id: "action-notify",
          messagingChannelId: "cmessagingchannel1234567890123",
        }),
        expect.objectContaining({
          id: "action-webhook",
          url: { value: "https://example.com/hook" },
        }),
      ]),
    );
  });

  it("creates newly added draft destinations without duplicating a persisted id", () => {
    const draftAction = {
      id: "action-draft",
      type: ActionType.DRAFT_EMAIL,
      content: { value: "Draft response", setManually: true },
      delayInMinutes: 30,
    };
    const labelAction = {
      id: "action-label",
      type: ActionType.LABEL,
      labelId: { value: "label-1", name: "Follow up" },
    };
    const originalActions = [draftAction, labelAction];

    const persistedActions = buildPersistedRuleActions({
      formActions: [
        labelAction,
        draftAction,
        {
          ...draftAction,
          type: ActionType.DRAFT_MESSAGING_CHANNEL,
          messagingChannelId: "cmessagingchannel1234567890123",
        },
      ],
      originalActions,
      includeDigestAction: false,
      notifyMessagingChannelId: null,
      webhookActionsEnabled: true,
    });

    expect(persistedActions.map((action) => action.id)).toEqual([
      "action-draft",
      "action-label",
      undefined,
    ]);
    expect(persistedActions.at(2)).toEqual(
      expect.objectContaining({
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
        messagingChannelId: "cmessagingchannel1234567890123",
        delayInMinutes: 30,
      }),
    );
  });

  it("keeps a messaging draft id on its existing destination when adding email", () => {
    const chatDraftAction = {
      id: "action-chat-draft",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      messagingChannelId: "cmessagingchannel1234567890123",
      content: { value: "Draft response", setManually: true },
      delayInMinutes: 30,
    };
    const labelAction = {
      id: "action-label",
      type: ActionType.LABEL,
      labelId: { value: "label-1", name: "Follow up" },
    };
    const originalActions = [chatDraftAction, labelAction];

    const persistedActions = buildPersistedRuleActions({
      formActions: [
        labelAction,
        {
          ...chatDraftAction,
          type: ActionType.DRAFT_EMAIL,
          messagingChannelId: null,
        },
        chatDraftAction,
      ],
      originalActions,
      includeDigestAction: false,
      notifyMessagingChannelId: null,
      webhookActionsEnabled: true,
    });

    expect(persistedActions.map((action) => action.id)).toEqual([
      "action-chat-draft",
      "action-label",
      undefined,
    ]);
    expect(persistedActions.map((action) => action.type)).toEqual([
      ActionType.DRAFT_MESSAGING_CHANNEL,
      ActionType.LABEL,
      ActionType.DRAFT_EMAIL,
    ]);
  });

  it("keeps a legacy channel-targeted draft id on its normalized destination", () => {
    const legacyChatDraftAction = {
      id: "action-legacy-chat-draft",
      type: ActionType.DRAFT_EMAIL,
      messagingChannelId: "cmessagingchannel1234567890123",
      content: { value: "Draft response", setManually: true },
    };
    const labelAction = {
      id: "action-label",
      type: ActionType.LABEL,
      labelId: { value: "label-1", name: "Follow up" },
    };

    const persistedActions = buildPersistedRuleActions({
      formActions: [
        labelAction,
        {
          ...legacyChatDraftAction,
          type: ActionType.DRAFT_EMAIL,
          messagingChannelId: null,
        },
        {
          ...legacyChatDraftAction,
          type: ActionType.DRAFT_MESSAGING_CHANNEL,
        },
      ],
      originalActions: [legacyChatDraftAction, labelAction],
      includeDigestAction: false,
      notifyMessagingChannelId: null,
      webhookActionsEnabled: true,
    });

    expect(persistedActions.map((action) => action.id)).toEqual([
      "action-legacy-chat-draft",
      "action-label",
      undefined,
    ]);
    expect(persistedActions.map((action) => action.type)).toEqual([
      ActionType.DRAFT_MESSAGING_CHANNEL,
      ActionType.LABEL,
      ActionType.DRAFT_EMAIL,
    ]);
  });
});
