import { setupI18n } from "@lingui/core";
import { describe, expect, it } from "vitest";
import { ActionType, MessagingProvider } from "@/generated/prisma/enums";
import { getActionDisplay } from "@/utils/action-display";
import { getActionDisplayText } from "@/utils/action-display-messages";

type DisplayAction = Parameters<typeof getActionDisplay>[0];

const labels = [{ id: "label-1", name: "Newsletters and promotions" }];

// Keyed by ActionType so a new action type fails to compile until it has cases.
const actionCases: Record<ActionType, Omit<DisplayAction, "type">[]> = {
  [ActionType.DRAFT_EMAIL]: [{}, { content: "Thanks for reaching out" }],
  [ActionType.DRAFT_MESSAGING_CHANNEL]: [{}, { content: "Quick update" }],
  [ActionType.LABEL]: [
    {},
    { label: "Receipts from vendors" },
    { labelId: "label-1", label: "Old name" },
  ],
  [ActionType.ARCHIVE]: [{}],
  [ActionType.DELETE]: [{}],
  [ActionType.MARK_READ]: [{}],
  [ActionType.STAR]: [{}],
  [ActionType.MARK_SPAM]: [{}],
  [ActionType.REPLY]: [{}],
  [ActionType.SEND_EMAIL]: [{}, { to: "someone@example.com" }],
  [ActionType.FORWARD]: [{}, { to: "someone@example.com" }],
  [ActionType.MOVE_FOLDER]: [{}, { folderName: "Archive/2024" }],
  [ActionType.DIGEST]: [{}],
  [ActionType.CALL_WEBHOOK]: [{}],
  [ActionType.NOTIFY_MESSAGING_CHANNEL]: [
    {},
    { notificationDestination: "#team-notifications-channel" },
    { messagingChannel: { provider: MessagingProvider.SLACK } },
  ],
  [ActionType.NOTIFY_SENDER]: [{}],
  [ActionType.INTEGRATION]: [
    {},
    { integrationName: "unknown", integrationToolName: "unknown" },
    {
      integrationName: "todoist",
      integrationToolName: "add-tasks",
      integrationArgs: { content: "Pay the electricity bill this week" },
    },
  ],
};

const cases = Object.values(ActionType).flatMap((type) =>
  actionCases[type].flatMap((fields) =>
    ["google", "microsoft"].map(
      (provider) => [type, provider, { type, ...fields }] as const,
    ),
  ),
);

describe("getActionDisplayText", () => {
  const i18n = setupI18n({ locale: "en", messages: { en: {} } });

  it.each(
    cases,
  )("matches getActionDisplay in English for %s (%s)", (_type, provider, action) => {
    expect(getActionDisplayText(action, provider, labels, i18n)).toBe(
      getActionDisplay(action, provider, labels),
    );
  });
});
