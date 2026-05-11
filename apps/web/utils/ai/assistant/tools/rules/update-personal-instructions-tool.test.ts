import type { Prisma } from "@/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { updatePersonalInstructionsTool } from "./update-personal-instructions-tool";

vi.mock("@/utils/prisma");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));

const logger = createScopedLogger("update-personal-instructions-tool-test");

describe("updatePersonalInstructionsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves concurrent append updates", async () => {
    let about = "Existing instructions";
    let locked = false;
    let sawOverlappingQuery = false;
    let activeQueries = 0;
    const lockWaiters: Array<() => void> = [];

    vi.mocked(prisma.$queryRaw).mockImplementation(
      async (query: TemplateStringsArray | Prisma.Sql) => {
        activeQueries += 1;
        if (activeQueries > 1) sawOverlappingQuery = true;

        const usesRowLock = getSqlText(query).includes("FOR UPDATE");
        if (usesRowLock) await acquireLock();

        try {
          const values = "values" in query ? query.values : [];
          const personalInstructions = values[1] as string;
          const previous = about;
          await Promise.resolve();

          about = previous
            ? `${previous}\n${personalInstructions}`
            : personalInstructions;

          return [{ previous, updated: about }];
        } finally {
          if (usesRowLock) releaseLock();
          activeQueries -= 1;
        }
      },
    );

    async function acquireLock() {
      while (locked) {
        await new Promise<void>((resolve) => lockWaiters.push(resolve));
      }
      locked = true;
    }

    function releaseLock() {
      locked = false;
      lockWaiters.shift()?.();
    }

    const toolInstance = updatePersonalInstructionsTool({
      email: "user@example.com",
      emailAccountId: "email-account-1",
      logger,
    });

    const [firstResult, secondResult] = await Promise.all([
      toolInstance.execute({
        personalInstructions: "First append",
        mode: "append",
      }),
      toolInstance.execute({
        personalInstructions: "Second append",
        mode: "append",
      }),
    ]);

    expect(firstResult.success).toBe(true);
    expect(secondResult.success).toBe(true);
    expect(sawOverlappingQuery).toBe(true);
    expect(about.split("\n")).toEqual(
      expect.arrayContaining([
        "Existing instructions",
        "First append",
        "Second append",
      ]),
    );
    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
  });
});

function getSqlText(query: TemplateStringsArray | Prisma.Sql) {
  if ("sql" in query) return query.sql;
  return Array.from(query).join("?");
}
