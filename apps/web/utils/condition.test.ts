import { describe, it, expect } from "vitest";
import { ConditionType } from "@/utils/config";
import { createTestLogger } from "@/__tests__/helpers";
import { LogicalOperator, SubjectMatchMode } from "@/generated/prisma/enums";
import {
  conditionsToString,
  describeStaticConditions,
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

describe("describeStaticConditions", () => {
  it("emits in the order the matcher evaluates them", () => {
    const described = describeStaticConditions({
      body: "invoice",
      subject: "receipt",
      to: "billing@nucar.com",
      from: "@vendor.com",
    });

    expect(described.map((condition) => condition.field)).toEqual([
      "from",
      "to",
      "subject",
      "body",
    ]);
  });

  it("names the match mode so STARTS_WITH is distinguishable", () => {
    expect(
      describeStaticConditions({
        subject: "Re:",
        subjectMatchMode: SubjectMatchMode.STARTS_WITH,
      })[0].text,
    ).toBe('Subject starts with: "Re:"');

    expect(describeStaticConditions({ subject: "Re:" })[0].text).toBe(
      'Subject contains: "Re:"',
    );
  });

  it("reports exclusion rather than the match mode when both are set", () => {
    expect(
      describeStaticConditions({
        subject: "Re:",
        subjectExclude: true,
        subjectMatchMode: SubjectMatchMode.STARTS_WITH,
      })[0].text,
    ).toBe('Subject doesn\'t contain: "Re:"');
  });

  it("negates sender and recipient conditions", () => {
    expect(
      describeStaticConditions({ from: "@nucar.com", fromExclude: true })[0]
        .text,
    ).toBe("Not from: @nucar.com");
    expect(
      describeStaticConditions({ to: "@nucar.com", toExclude: true })[0].text,
    ).toBe("Not to: @nucar.com");
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

    expect(result).toBe(
      `Not from: @nucar.com AND Subject doesn't contain: "auto-report"`,
    );
  });

  // Static conditions are always ANDed with each other; the rule's
  // conditionalOperator only separates them from the AI clause.
  it("joins static conditions with AND", () => {
    expect(
      conditionsToString({ from: "@nucar.com", subject: "Daily Report" }),
    ).toBe('From: @nucar.com AND Subject contains: "Daily Report"');
  });

  // Without the brackets this read "From: x, Subject: y OR <instructions>",
  // which looks like the OR binds to the subject alone.
  it("brackets the static group when an AI clause follows", () => {
    expect(
      conditionsToString({
        from: "@nucar.com",
        subject: "Daily Report",
        instructions: "urgent requests",
        conditionalOperator: LogicalOperator.OR,
      }),
    ).toBe(
      '(From: @nucar.com AND Subject contains: "Daily Report") OR urgent requests',
    );
  });

  it("leaves a single static condition unbracketed", () => {
    expect(
      conditionsToString({
        from: "@nucar.com",
        instructions: "urgent requests",
        conditionalOperator: LogicalOperator.AND,
      }),
    ).toBe("From: @nucar.com AND urgent requests");
  });
});
