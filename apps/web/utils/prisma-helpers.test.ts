import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { isDuplicateError } from "./prisma-helpers";

describe("isDuplicateError", () => {
  it("matches fields from Prisma driver adapter errors", () => {
    const error = createDriverAdapterDuplicateError([
      "emailAccountId",
      "sender",
      "ruleId",
      "messageId",
      "eventType",
    ]);

    expect(
      isDuplicateError(error, [
        "emailAccountId",
        "sender",
        "ruleId",
        "messageId",
        "eventType",
      ]),
    ).toBe(true);
    expect(isDuplicateError(error, "otherField")).toBe(false);
  });

  it("matches the index name when the driver adapter reports no fields", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "7.8.0",
        meta: {
          modelName: "Rule",
          driverAdapterError: {
            cause: {
              kind: "UniqueConstraintViolation",
              constraint: { index: "Rule_name_emailAccountId_key" },
            },
          },
        },
      },
    );

    expect(isDuplicateError(error, "name")).toBe(true);
    expect(isDuplicateError(error, ["name", "emailAccountId"])).toBe(true);
    expect(isDuplicateError(error, "email")).toBe(false);
    expect(isDuplicateError(error, "systemType")).toBe(false);
  });

  it("matches index names that Postgres truncated to 63 characters", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "7.8.0",
        meta: {
          modelName: "ClassificationFeedback",
          driverAdapterError: {
            cause: {
              kind: "UniqueConstraintViolation",
              constraint: {
                index:
                  "ClassificationFeedback_emailAccountId_sender_ruleId_messageId_e",
              },
            },
          },
        },
      },
    );

    expect(
      isDuplicateError(error, [
        "emailAccountId",
        "sender",
        "ruleId",
        "messageId",
        "eventType",
      ]),
    ).toBe(true);
    expect(isDuplicateError(error, "threadId")).toBe(false);
    expect(isDuplicateError(error, ["emailAccountId", "sender"])).toBe(false);
    expect(
      isDuplicateError(error, [
        "sender",
        "emailAccountId",
        "ruleId",
        "messageId",
        "eventType",
      ]),
    ).toBe(false);
  });
});

function createDriverAdapterDuplicateError(fields: string[]) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.8.0",
    meta: {
      modelName: "ClassificationFeedback",
      driverAdapterError: {
        cause: {
          kind: "UniqueConstraintViolation",
          constraint: { fields },
        },
      },
    },
  });
}
