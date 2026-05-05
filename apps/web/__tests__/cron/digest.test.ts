import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/utils/digest/run-daily-digest", () => ({
  runDailyDigest: vi.fn(async () => ({ processedAccounts: 0, results: [] })),
}));
vi.mock("@/utils/cron", () => ({
  hasCronSecret: vi.fn(),
  hasPostCronSecret: vi.fn(),
}));
vi.mock("@/utils/error", () => ({ captureException: vi.fn() }));
vi.mock("@/utils/middleware", () => ({
  withError:
    (_label: string, fn: (req: unknown) => unknown) => (req: unknown) =>
      fn(req),
}));

const makeReq = (auth?: string) =>
  ({
    headers: new Headers(auth ? { authorization: auth } : {}),
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      with: () => ({
        info: () => {},
        warn: () => {},
        error: () => {},
      }),
    },
  }) as unknown as Request & { logger: unknown };

describe("/api/cron/digest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 without Bearer CRON_SECRET", async () => {
    const { hasCronSecret } = await import("@/utils/cron");
    vi.mocked(hasCronSecret).mockReturnValue(false);
    const { GET } = await import("@/app/api/cron/digest/route");
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(401);
  });

  it("invokes runDailyDigest when auth passes", async () => {
    const { hasCronSecret } = await import("@/utils/cron");
    vi.mocked(hasCronSecret).mockReturnValue(true);
    const { runDailyDigest } = await import("@/utils/digest/run-daily-digest");
    const { GET } = await import("@/app/api/cron/digest/route");
    await GET(makeReq("Bearer x") as never);
    expect(runDailyDigest).toHaveBeenCalledOnce();
  });
});
