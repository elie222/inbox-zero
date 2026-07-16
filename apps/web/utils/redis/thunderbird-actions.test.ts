import { describe, expect, it } from "vitest";
import {
  isThunderbirdBulkAction,
  thunderbirdActionSchema,
} from "./thunderbird-actions";

describe("thunderbird bulk actions", () => {
  it("parses bulk_archive actions", () => {
    const action = thunderbirdActionSchema.parse({
      type: "bulk_archive",
      id: "bulk-1",
      fromEmails: ["news@example.com", "promo@example.com"],
      accountEmail: "me@example.com",
      thunderbirdAccountId: "account1",
    });

    expect(isThunderbirdBulkAction(action)).toBe(true);
    expect(action).toMatchObject({
      type: "bulk_archive",
      fromEmails: ["news@example.com", "promo@example.com"],
    });
  });

  it("parses bulk_trash actions", () => {
    const action = thunderbirdActionSchema.parse({
      type: "bulk_trash",
      id: "bulk-2",
      fromEmails: ["spam@example.com"],
    });

    expect(isThunderbirdBulkAction(action)).toBe(true);
    expect(action.type).toBe("bulk_trash");
  });

  it("does not treat single-message archive as bulk", () => {
    const action = thunderbirdActionSchema.parse({
      type: "archive",
      id: "a1",
      messageId: "m1",
      threadId: "t1",
      thunderbirdMessageId: 9,
    });

    expect(isThunderbirdBulkAction(action)).toBe(false);
  });
});
