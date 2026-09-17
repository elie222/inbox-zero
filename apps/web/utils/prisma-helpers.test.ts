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
    expect(isDuplicateError(error, "systemType")).toBe(false);
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
