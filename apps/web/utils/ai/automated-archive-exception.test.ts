import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionType } from "@/generated/prisma/enums";
import { shouldSkipAutomatedArchiveForSender } from "@/utils/ai/automated-archive-exception";

const { envMock } = vi.hoisted(() => ({
  envMock: {
    WHITELIST_FROM: undefined as string | undefined,
  },
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

describe("shouldSkipAutomatedArchiveForSender", () => {
  beforeEach(() => {
    envMock.WHITELIST_FROM = undefined;
  });

  it("skips archive actions for the whitelisted sender", () => {
    envMock.WHITELIST_FROM = "onboarding@getinboxzero.com";

    expect(
      shouldSkipAutomatedArchiveForSender({
        actionType: ActionType.ARCHIVE,
        from: "Inbox Zero <onboarding@getinboxzero.com>",
      }),
    ).toBe(true);
  });

  it("does not skip archive actions for ordinary senders", () => {
    envMock.WHITELIST_FROM = "onboarding@getinboxzero.com";

    expect(
      shouldSkipAutomatedArchiveForSender({
        actionType: ActionType.ARCHIVE,
        from: "Sender <sender@example.com>",
      }),
    ).toBe(false);
  });

  it("does not skip non-archive actions for company senders", () => {
    envMock.WHITELIST_FROM = "onboarding@getinboxzero.com";

    expect(
      shouldSkipAutomatedArchiveForSender({
        actionType: ActionType.LABEL,
        from: "Inbox Zero <onboarding@getinboxzero.com>",
      }),
    ).toBe(false);
  });
});
