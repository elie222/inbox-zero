import { describe, it, expect } from "vitest";
import { ConditionType } from "@/utils/config";
import { createTestLogger } from "@/__tests__/helpers";
import {
  conditionsToString,
  flattenConditions,
  getConditions,
} from "./condition";

describe("flattenConditions", () => {
  const logger = createTestLogger();

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

  it("carries per-field negation flags", () => {
    const conditions = [
      {
        type: ConditionType.STATIC,
        from: "@nucar.com",
        fromExclude: true,
        to: null,
        subject: null,
        body: null,
        instructions: null,
      },
      {
        type: ConditionType.STATIC,
        from: null,
        to: null,
        subject: "auto-report",
        subjectExclude: true,
        body: null,
        instructions: null,
      },
    ];

    const result = flattenConditions(conditions as any, logger);

    expect(result.from).toBe("@nucar.com");
    expect(result.fromExclude).toBe(true);
    expect(result.subject).toBe("auto-report");
    expect(result.subjectExclude).toBe(true);
    expect(result.toExclude).toBeUndefined();
  });
});

describe("getConditions", () => {
  it("round-trips negation flags into the editor conditions", () => {
    const conditions = getConditions({
      from: "@nucar.com",
      fromExclude: true,
      subject: "auto-report",
      subjectExclude: true,
      to: "team@nucar.com",
      toExclude: false,
    });

    expect(conditions).toEqual([
      expect.objectContaining({ from: "@nucar.com", fromExclude: true }),
      expect.objectContaining({ to: "team@nucar.com", toExclude: false }),
      expect.objectContaining({
        subject: "auto-report",
        subjectExclude: true,
      }),
    ]);
  });
});

describe("conditionsToString", () => {
  it("renders negated conditions with a Not prefix", () => {
    const result = conditionsToString({
      from: "@nucar.com",
      fromExclude: true,
      subject: "auto-report",
      subjectExclude: true,
    });

    expect(result).toBe('Not From: @nucar.com, Not Subject: "auto-report"');
  });

  it("renders positive conditions unchanged", () => {
    const result = conditionsToString({
      from: "@nucar.com",
      subject: "Daily Report",
    });

    expect(result).toBe('From: @nucar.com, Subject: "Daily Report"');
  });
});
