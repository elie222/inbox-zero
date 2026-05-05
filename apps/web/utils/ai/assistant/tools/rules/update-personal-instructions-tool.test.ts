import type { Prisma } from "@/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { updatePersonalInstructionsTool } from "./update-personal-instructions-tool";

vi.mock("server-only", () => ({}));
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
    let activeWrites = 0;

    vi.mocked(prisma.$queryRaw).mockImplementation(
      async (query: TemplateStringsArray | Prisma.Sql) => {
        activeWrites += 1;
        const snapshot = about;
        await Promise.resolve();
        if (activeWrites > 1) expect(about).toBe(snapshot);

        const values = "values" in query ? query.values : [];
        const personalInstructions = values[1] as string;
        const previous = about;
        about = about
          ? `${about}\n${personalInstructions}`
          : personalInstructions;

        activeWrites -= 1;
        return [{ previous, updated: about }];
      },
    );

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
