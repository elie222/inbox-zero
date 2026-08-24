import { describe, expect, it } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import {
  applyMailMutationOverlayToMessages,
  isThreadHiddenByMailMutations,
} from "./mail-mutation-overlay";
import type { MailMutation } from "./mail-mutations";

describe("mail mutation overlay", () => {
  it("hides only captured messages and applies the latest read state", () => {
    const messages = [
      message("old", "thread", ["INBOX", "UNREAD"]),
      message("new", "thread", ["INBOX", "UNREAD"]),
      message("other", "other", ["INBOX", "UNREAD"]),
    ];
    const mutations = [
      mutation({ id: "archive", kind: "archive", messageIds: ["old"] }),
      mutation({
        id: "read",
        kind: "set_read_state",
        messageIds: ["other"],
        read: true,
      }),
    ];

    const result = applyMailMutationOverlayToMessages({
      emailAccountId: "account",
      messages,
      mutations,
    });

    expect(result.map(({ id }) => id)).toEqual(["new", "other"]);
    expect(result[1]?.labelIds).toEqual(["INBOX"]);
  });

  it("keeps a thread visible when a new untargeted reply arrives", () => {
    const mutations = [
      mutation({ id: "archive", kind: "archive", messageIds: ["old"] }),
    ];

    expect(
      isThreadHiddenByMailMutations({
        emailAccountId: "account",
        threadId: "thread",
        messageIds: ["old", "new"],
        mutations,
      }),
    ).toBe(false);
    expect(
      isThreadHiddenByMailMutations({
        emailAccountId: "account",
        threadId: "thread",
        messageIds: ["old"],
        mutations,
      }),
    ).toBe(true);
  });

  it("applies undo compensation after a hidden mutation", () => {
    const mutations = [
      mutation({ id: "archive", kind: "archive", messageIds: ["old"] }),
      mutation({ id: "undo", kind: "unarchive", messageIds: ["old"] }),
    ];
    mutations[1]!.createdAt = 1;

    expect(
      isThreadHiddenByMailMutations({
        emailAccountId: "account",
        threadId: "thread",
        messageIds: ["old"],
        mutations,
      }),
    ).toBe(false);
  });
});

function mutation(
  value:
    | {
        id: string;
        kind: "archive" | "unarchive";
        messageIds: string[];
      }
    | {
        id: string;
        kind: "set_read_state";
        messageIds: string[];
        read: boolean;
      },
): MailMutation {
  return {
    ...value,
    batchId: value.id,
    emailAccountId: "account",
    threadId: "thread",
    status: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

function message(id: string, threadId: string, labelIds: string[]) {
  return { id, threadId, labelIds } as ParsedMessage;
}
