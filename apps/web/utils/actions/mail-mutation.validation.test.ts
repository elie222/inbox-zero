import { describe, expect, it } from "vitest";
import { executeArchiveMutationBatchBody } from "./mail-mutation.validation";

describe("executeArchiveMutationBatchBody", () => {
  it("accepts a batch at the provider request limit", () => {
    const result = executeArchiveMutationBatchBody.safeParse({
      mutations: [
        { messageIds: messageIds(600) },
        { messageIds: messageIds(400, 600) },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects a batch above the provider request limit", () => {
    const result = executeArchiveMutationBatchBody.safeParse({
      mutations: [
        { messageIds: messageIds(600) },
        { messageIds: messageIds(401, 600) },
      ],
    });

    expect(result.success).toBe(false);
  });
});

function messageIds(count: number, offset = 0) {
  return Array.from(
    { length: count },
    (_, index) => `message-${offset + index}`,
  );
}
