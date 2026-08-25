import { describe, expect, it } from "vitest";
import type { MailMutation } from "@/utils/email-cache/mail-mutations";
import type { ParsedMessage } from "@/utils/types";
import { applyMailMutationOverlayToThreads } from "./use-mail-mutation-overlay";

describe("applyMailMutationOverlayToThreads", () => {
  it("uses account and thread identity when provider ids collide", () => {
    const threads = [
      thread("account-1", "shared", [message("shared-message", true)]),
      thread("account-2", "shared", [message("shared-message", true)]),
    ];

    expect(
      applyMailMutationOverlayToThreads({
        getEmailAccountId: (item) => item.accountId,
        mutations: [
          mutation({
            emailAccountId: "account-1",
            kind: "archive",
            messageIds: ["shared-message"],
            threadId: "shared",
          }),
        ],
        threads,
      }),
    ).toEqual([threads[1]]);
  });

  it("keeps a new reply visible and applies captured read state", () => {
    const result = applyMailMutationOverlayToThreads({
      getEmailAccountId: (item) => item.accountId,
      mutations: [
        mutation({ kind: "archive", messageIds: ["old-message"] }),
        mutation({
          id: "read-mutation",
          kind: "set_read_state",
          messageIds: ["new-message"],
          read: true,
        }),
      ],
      threads: [
        thread("account-1", "thread-1", [
          message("old-message", true),
          message("new-message", true),
        ]),
      ],
    });

    expect(result[0]?.messages).toEqual([
      expect.objectContaining({ id: "new-message", labelIds: ["INBOX"] }),
    ]);
  });

  it("preserves a legacy cached row without an embedded message snapshot", () => {
    const cachedThread = { accountId: "account-1", id: "thread-1" };

    expect(
      applyMailMutationOverlayToThreads({
        getEmailAccountId: (item) => item.accountId,
        mutations: [mutation({ kind: "archive", messageIds: ["old-message"] })],
        threads: [cachedThread],
      }),
    ).toEqual([cachedThread]);
  });
});

function thread(
  accountId: string,
  id: string,
  messages: ReturnType<typeof message>[],
) {
  return { accountId, id, messages };
}

function message(id: string, unread: boolean) {
  return {
    id,
    threadId: "thread-1",
    labelIds: unread ? ["INBOX", "UNREAD"] : ["INBOX"],
  } as ParsedMessage;
}

function mutation(
  value:
    | {
        id?: string;
        emailAccountId?: string;
        kind: "archive";
        messageIds: string[];
        threadId?: string;
      }
    | {
        id?: string;
        emailAccountId?: string;
        kind: "set_read_state";
        messageIds: string[];
        read: boolean;
        threadId?: string;
      },
): MailMutation {
  const id = value.id ?? "mutation";
  return {
    ...value,
    id,
    batchId: id,
    emailAccountId: value.emailAccountId ?? "account-1",
    threadId: value.threadId ?? "thread-1",
    status: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}
