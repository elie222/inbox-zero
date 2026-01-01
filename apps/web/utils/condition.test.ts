import { describe, it, expect, vi } from "vitest";
import { ConditionType } from "@/utils/config";
import { flattenConditions } from "./condition";
import type { Logger } from "@/utils/logger";

describe("flattenConditions", () => {
  const logger = {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  } as unknown as Logger;

  it("should merge multiple static conditions without overwriting with null", () => {
    const conditions = [
      {
        type: ConditionType.STATIC,
        from: "@linkedin.com",
        to: null,
        subject: null,
        body: null,
        instructions: null,
      },
      {
        type: ConditionType.STATIC,
        from: null,
        to: null,
        subject: "message",
        body: null,
        instructions: null,
      },
    ];

    const result = flattenConditions(conditions as any, logger);

    expect(result.from).toBe("@linkedin.com");
    expect(result.subject).toBe("message");
  });

  it("should handle AI conditions", () => {
    const conditions = [
      {
        type: ConditionType.AI,
        instructions: "summarize this",
      },
    ];

    const result = flattenConditions(conditions as any, logger);

    expect(result.instructions).toBe("summarize this");
  });

  it("should handle mixed conditions", () => {
    const conditions = [
      {
        type: ConditionType.STATIC,
        from: "test@example.com",
        to: null,
        subject: null,
        body: null,
        instructions: null,
      },
      {
        type: ConditionType.AI,
        instructions: "process this",
      },
    ];

    const result = flattenConditions(conditions as any, logger);

    expect(result.from).toBe("test@example.com");
    expect(result.instructions).toBe("process this");
  });
});
