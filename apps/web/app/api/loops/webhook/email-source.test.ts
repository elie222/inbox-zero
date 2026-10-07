import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { enrichLoopsEmailNames } from "./email-source";

const { envMock, getWorkflowNameMock, getCampaignNameMock } = vi.hoisted(
  () => ({
    envMock: { LOOPS_API_SECRET: "secret" as string },
    getWorkflowNameMock: vi.fn(),
    getCampaignNameMock: vi.fn(),
  }),
);

vi.mock("@/env", () => ({ env: envMock }));
vi.mock("@/utils/prisma");
vi.mock("@inboxzero/loops", () => ({
  getWorkflowName: (...args: unknown[]) => getWorkflowNameMock(...args),
  getCampaignName: (...args: unknown[]) => getCampaignNameMock(...args),
}));

const logger = createScopedLogger("test");

describe("enrichLoopsEmailNames", () => {
  beforeEach(() => {
    envMock.LOOPS_API_SECRET = "secret";
    getWorkflowNameMock.mockReset();
    getCampaignNameMock.mockReset();
    getWorkflowNameMock.mockResolvedValue(null);
    getCampaignNameMock.mockResolvedValue(null);
    prisma.loopsEmailSource.findUnique.mockResolvedValue(null);
    prisma.loopsEmailSource.findFirst.mockResolvedValue(null);
    prisma.loopsEmailSource.upsert.mockResolvedValue({
      id: "source_1",
    } as never);
    prisma.loopsEmailSource.update.mockResolvedValue({
      id: "source_1",
    } as never);
    prisma.loopsEmailSource.create.mockResolvedValue({
      id: "source_1",
    } as never);
  });

  it("remembers the name from a workflow send", async () => {
    const names = await enrichLoopsEmailNames(
      {
        loopId: "loop_1",
        loopName: "Welcome series",
        emailMessageId: "message_1",
      },
      logger,
    );

    expect(names).toEqual({
      loopName: "Welcome series",
      campaignName: undefined,
    });
    expect(prisma.loopsEmailSource.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailMessageId: "message_1" },
        create: expect.objectContaining({
          loopId: "loop_1",
          loopName: "Welcome series",
          sourceType: "loop",
        }),
      }),
    );
    expect(getWorkflowNameMock).not.toHaveBeenCalled();
  });

  it("remembers the name from a campaign send", async () => {
    await enrichLoopsEmailNames(
      {
        campaignId: "campaign_1",
        campaignName: "October update",
        sourceType: "campaign",
        emailMessageId: "message_2",
      },
      logger,
    );

    expect(prisma.loopsEmailSource.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailMessageId: "message_2" },
        create: expect.objectContaining({
          campaignId: "campaign_1",
          campaignName: "October update",
          sourceType: "campaign",
        }),
      }),
    );
  });

  it("uses the name stored for that email version", async () => {
    prisma.loopsEmailSource.findUnique.mockResolvedValue({
      loopName: "Welcome series",
      campaignName: null,
    });

    const names = await enrichLoopsEmailNames(
      {
        sourceType: "loop",
        loopId: "loop_1",
        emailMessageId: "message_1",
      },
      logger,
    );

    expect(names.loopName).toBe("Welcome series");
    expect(prisma.loopsEmailSource.findFirst).not.toHaveBeenCalled();
    expect(getWorkflowNameMock).not.toHaveBeenCalled();
  });

  it("falls back to another send of the same workflow when this version was not stored", async () => {
    prisma.loopsEmailSource.findFirst.mockResolvedValue({
      loopName: "Welcome series",
      campaignName: null,
    });

    const names = await enrichLoopsEmailNames(
      {
        sourceType: "loop",
        loopId: "loop_1",
        emailMessageId: "message_new",
      },
      logger,
    );

    expect(names.loopName).toBe("Welcome series");
    expect(prisma.loopsEmailSource.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { loopId: "loop_1", loopName: { not: null } },
        orderBy: { eventTime: { sort: "desc", nulls: "last" } },
      }),
    );
    expect(getWorkflowNameMock).not.toHaveBeenCalled();
  });

  it("falls back to another send of the same campaign", async () => {
    prisma.loopsEmailSource.findFirst.mockResolvedValue({
      loopName: null,
      campaignName: "October update",
    });

    const names = await enrichLoopsEmailNames(
      { sourceType: "campaign", campaignId: "campaign_1" },
      logger,
    );

    expect(names.campaignName).toBe("October update");
    expect(getCampaignNameMock).not.toHaveBeenCalled();
  });

  it("loads a workflow name from Loops when no send was stored", async () => {
    getWorkflowNameMock.mockResolvedValue("Welcome series");

    const names = await enrichLoopsEmailNames(
      {
        sourceType: "loop",
        loopId: "loop_api",
        emailMessageId: "message_api",
      },
      logger,
    );

    expect(names.loopName).toBe("Welcome series");
    expect(getWorkflowNameMock).toHaveBeenCalledWith("loop_api");
    expect(prisma.loopsEmailSource.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailMessageId: "message_api" },
        create: expect.objectContaining({
          loopId: "loop_api",
          loopName: "Welcome series",
        }),
      }),
    );
  });

  it("loads a campaign name from Loops when no send was stored", async () => {
    getCampaignNameMock.mockResolvedValue("October update");

    const names = await enrichLoopsEmailNames(
      {
        sourceType: "campaign",
        campaignId: "campaign_api",
        emailMessageId: "message_campaign_api",
      },
      logger,
    );

    expect(names.campaignName).toBe("October update");
    expect(getCampaignNameMock).toHaveBeenCalledWith("campaign_api");
  });

  it("keeps a newer stored name when an older send is redelivered", async () => {
    prisma.loopsEmailSource.findUnique.mockResolvedValue({
      loopName: "Renamed series",
      campaignName: null,
      eventTime: new Date("2026-10-07T00:00:00.000Z"),
    });

    const names = await enrichLoopsEmailNames(
      {
        loopId: "loop_1",
        loopName: "Welcome series",
        emailMessageId: "message_1",
        eventTime: new Date("2026-10-06T00:00:00.000Z"),
      },
      logger,
    );

    expect(names.loopName).toBe("Welcome series");
    expect(prisma.loopsEmailSource.upsert).not.toHaveBeenCalled();
  });

  it("does not rewrite a version when the same name arrives again", async () => {
    prisma.loopsEmailSource.findUnique.mockResolvedValue({
      loopName: "Welcome series",
      campaignName: null,
      eventTime: new Date("2026-10-06T00:00:00.000Z"),
    });

    await enrichLoopsEmailNames(
      {
        loopId: "loop_1",
        loopName: "Welcome series",
        emailMessageId: "message_1",
        eventTime: new Date("2026-10-06T12:00:00.000Z"),
      },
      logger,
    );

    expect(prisma.loopsEmailSource.upsert).not.toHaveBeenCalled();
  });

  it("stores a workflow name without an email version on its own row", async () => {
    await enrichLoopsEmailNames(
      { loopId: "loop_unversioned", loopName: "Welcome series" },
      logger,
    );

    expect(prisma.loopsEmailSource.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { loopId: "loop_unversioned", emailMessageId: null },
      }),
    );
    expect(prisma.loopsEmailSource.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          loopId: "loop_unversioned",
          loopName: "Welcome series",
        }),
      }),
    );
    expect(prisma.loopsEmailSource.update).not.toHaveBeenCalled();
  });

  it("retries Loops after a lookup error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    getWorkflowNameMock.mockRejectedValueOnce(new Error("rate limited"));
    getWorkflowNameMock.mockResolvedValueOnce("Welcome series");

    const first = await enrichLoopsEmailNames({ loopId: "loop_retry" }, logger);
    const second = await enrichLoopsEmailNames(
      { loopId: "loop_retry" },
      logger,
    );

    expect(first.loopName).toBeUndefined();
    expect(second.loopName).toBe("Welcome series");
    expect(getWorkflowNameMock).toHaveBeenCalledTimes(2);
  });

  it("stops waiting when a Loops lookup does not finish", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    getWorkflowNameMock.mockImplementation(() => new Promise(() => {}));

    try {
      const pending = enrichLoopsEmailNames({ loopId: "loop_timeout" }, logger);
      await vi.advanceTimersByTimeAsync(3000);
      await expect(pending).resolves.toMatchObject({ loopName: undefined });
    } finally {
      vi.useRealTimers();
    }
  });

  it("shares one Loops lookup when the same workflow is resolved concurrently", async () => {
    let resolveName: (name: string) => void = () => {};
    getWorkflowNameMock.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveName = resolve;
        }),
    );

    const first = enrichLoopsEmailNames(
      { loopId: "loop_concurrent", emailMessageId: "message_concurrent" },
      logger,
    );
    const second = enrichLoopsEmailNames(
      { loopId: "loop_concurrent", emailMessageId: "message_concurrent" },
      logger,
    );
    await vi.waitFor(() => {
      expect(getWorkflowNameMock).toHaveBeenCalledTimes(1);
    });
    resolveName("Welcome series");

    await expect(Promise.all([first, second])).resolves.toEqual([
      { loopName: "Welcome series", campaignName: undefined },
      { loopName: "Welcome series", campaignName: undefined },
    ]);
  });

  it("reuses a Loops name when the database cannot store it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    prisma.loopsEmailSource.findUnique.mockRejectedValue(new Error("db down"));
    prisma.loopsEmailSource.upsert.mockRejectedValue(new Error("db down"));
    getWorkflowNameMock.mockResolvedValue("Welcome series");

    const first = await enrichLoopsEmailNames(
      { loopId: "loop_memory", emailMessageId: "message_memory_1" },
      logger,
    );
    const second = await enrichLoopsEmailNames(
      { loopId: "loop_memory", emailMessageId: "message_memory_2" },
      logger,
    );

    expect(first.loopName).toBe("Welcome series");
    expect(second.loopName).toBe("Welcome series");
    expect(getWorkflowNameMock).toHaveBeenCalledTimes(1);
  });

  it("does not ask Loops again after a miss", async () => {
    getWorkflowNameMock.mockResolvedValue(null);

    await enrichLoopsEmailNames({ loopId: "loop_missing" }, logger);
    await enrichLoopsEmailNames({ loopId: "loop_missing" }, logger);

    expect(getWorkflowNameMock).toHaveBeenCalledTimes(1);
  });

  it("returns no name when the lookup and Loops both fail", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    prisma.loopsEmailSource.findUnique.mockRejectedValue(new Error("db down"));
    getWorkflowNameMock.mockRejectedValue(new Error("loops down"));

    const names = await enrichLoopsEmailNames(
      {
        loopId: "loop_down",
        loopName: "  ",
        emailMessageId: "message_down",
      },
      logger,
    );

    expect(names.loopName).toBeUndefined();
  });

  it("still returns a payload name when remembering it fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    prisma.loopsEmailSource.upsert.mockRejectedValue(new Error("db down"));

    const names = await enrichLoopsEmailNames(
      {
        loopId: "loop_1",
        loopName: "Welcome series",
        emailMessageId: "message_1",
      },
      logger,
    );

    expect(names.loopName).toBe("Welcome series");
  });

  it("does not call Loops when no API secret is configured", async () => {
    envMock.LOOPS_API_SECRET = "";

    const names = await enrichLoopsEmailNames(
      { loopId: "loop_no_secret", campaignId: "campaign_no_secret" },
      logger,
    );

    expect(names).toEqual({ loopName: undefined, campaignName: undefined });
    expect(getWorkflowNameMock).not.toHaveBeenCalled();
    expect(getCampaignNameMock).not.toHaveBeenCalled();
  });
});
