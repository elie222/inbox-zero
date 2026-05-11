import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { autoPopulateTimezone } from "./timezone-helpers";

vi.mock("@/utils/prisma");

describe("autoPopulateTimezone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets the primary calendar timezone only when the email account timezone is still null", async () => {
    const logger = createTestLogger();
    const loggerInfoSpy = vi
      .spyOn(logger, "info")
      .mockImplementation(() => undefined);
    prisma.emailAccount.updateMany.mockResolvedValue({ count: 1 });

    await autoPopulateTimezone(
      "email-account-1",
      [
        { timeZone: "America/Chicago" },
        { timeZone: "America/New_York", primary: true },
      ],
      logger,
    );

    expect(prisma.emailAccount.updateMany).toHaveBeenCalledWith({
      where: { id: "email-account-1", timezone: null },
      data: { timezone: "America/New_York" },
    });
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      "Auto-populated EmailAccount timezone",
      {
        emailAccountId: "email-account-1",
        timezone: "America/New_York",
      },
    );
  });

  it("does not log when another writer already populated the timezone", async () => {
    const logger = createTestLogger();
    const loggerInfoSpy = vi
      .spyOn(logger, "info")
      .mockImplementation(() => undefined);
    prisma.emailAccount.updateMany.mockResolvedValue({ count: 0 });

    await autoPopulateTimezone(
      "email-account-1",
      [{ timeZone: "America/New_York", primary: true }],
      logger,
    );

    expect(loggerInfoSpy).not.toHaveBeenCalled();
  });

  it("does not update when calendars have no timezone", async () => {
    const logger = createTestLogger();
    const loggerInfoSpy = vi
      .spyOn(logger, "info")
      .mockImplementation(() => undefined);
    await autoPopulateTimezone("email-account-1", [{}], logger);

    expect(prisma.emailAccount.updateMany).not.toHaveBeenCalled();
    expect(loggerInfoSpy).not.toHaveBeenCalled();
  });
});
