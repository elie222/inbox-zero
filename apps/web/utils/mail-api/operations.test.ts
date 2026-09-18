import { describe, expect, it, vi } from "vitest";
import { createEmailProviderOperationExecutor } from "./operations";
import type { EmailProvider } from "@/utils/email/types";
import type { PreparedOperation } from "@inboxzero/mail-core/operations";

vi.mock("server-only", () => ({}));

describe("createEmailProviderOperationExecutor", () => {
  it("records per-target applied and rejected outcomes in one bulk archive", async () => {
    const executor = createEmailProviderOperationExecutor({
      accountId: "acc-1",
      provider: {
        name: "google",
        async archiveMessages(ids: string[]) {
          if (ids.includes("missing")) throw new Error("not found 404");
        },
        async getMessage(id: string) {
          return {
            id,
            threadId: `t-${id}`,
            headers: { from: "ada@example.com", to: "me@example.com" },
            labelIds: [],
            snippet: id,
          };
        },
      } as unknown as EmailProvider,
    });
    const operation = metadataOperation([
      { accountId: "acc-1", messageId: "kept" },
      { accountId: "acc-1", messageId: "missing" },
    ]);
    const result = await executor.execute({
      operation,
      attemptId: "a1",
      signal: new AbortController().signal,
    });
    expect(result.status).toBe("confirmed");
    if (result.status !== "confirmed") throw new Error("expected confirmed");
    expect(
      result.targets.map(
        (target) => `${target.key.messageId}:${target.outcome}`,
      ),
    ).toEqual(["kept:applied", "missing:rejected"]);
  });
});

function metadataOperation(
  targets: Array<{ accountId: string; messageId: string }>,
): PreparedOperation {
  return {
    key: { accountId: "acc-1", operationId: "bulk-1" },
    session: { accountId: "acc-1", generation: "g1" },
    authority: "backend",
    payloadHash: "hash",
    intent: {
      kind: "metadata",
      targets,
      change: { kind: "archive" },
    },
  };
}
