import { describe, expect, it } from "vitest";
import {
  ActionType,
  MailSplitKind,
  SystemType,
} from "@/generated/prisma/enums";
import { getDefaultMailSplitDrafts } from "@/utils/mail/default-splits";

describe("getDefaultMailSplitDrafts", () => {
  it("creates label splits for the standard category rules in their standard order", () => {
    const rules = [
      rule(SystemType.RECEIPT, "receipt-label"),
      rule(SystemType.FYI, "fyi-label"),
      rule(SystemType.TO_REPLY, "reply-label"),
      rule(SystemType.NEWSLETTER, "newsletter-label"),
      rule(null, "custom-label"),
    ];

    expect(getDefaultMailSplitDrafts(rules)).toEqual([
      {
        name: "To Reply",
        kind: MailSplitKind.LABEL,
        value: "reply-label",
      },
      {
        name: "Newsletter",
        kind: MailSplitKind.LABEL,
        value: "newsletter-label",
      },
      {
        name: "Receipt",
        kind: MailSplitKind.LABEL,
        value: "receipt-label",
      },
    ]);
  });

  it("skips standard rules without a resolved inbox label action", () => {
    const rules = [
      rule(SystemType.NEWSLETTER, null, ActionType.MOVE_FOLDER),
      rule(SystemType.RECEIPT, null),
      {
        ...rule(SystemType.MARKETING, "marketing-label"),
        actions: [
          { type: ActionType.LABEL, labelId: "marketing-label" },
          { type: ActionType.ARCHIVE, labelId: null },
        ],
      },
      rule(SystemType.NOTIFICATION, "notification-label"),
    ];

    expect(getDefaultMailSplitDrafts(rules)).toEqual([
      {
        name: "Notification",
        kind: MailSplitKind.LABEL,
        value: "notification-label",
      },
    ]);
  });
});

function rule(
  systemType: SystemType | null,
  labelId: string | null,
  type = ActionType.LABEL,
) {
  return {
    systemType,
    actions: [{ type, labelId }],
  };
}
