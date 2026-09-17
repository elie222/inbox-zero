import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  LocalMailSyncPausedError,
  withLocalMailSyncBudget,
} from "@/utils/email/local-mail-sync-budget";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/redis", () => ({
  redis: {
    eval: (script: string, keys: string[], args: string[]) =>
      command("EVAL", script, String(keys.length), ...keys, ...args),
    get: (key: string) => command("GET", key),
    del: (key: string) => command("DEL", key),
  },
}));

const execute = promisify(execFile);
const container = `local-mail-budget-test-${randomUUID()}`;
const input = {
  emailAccountId: "account-1",
  provider: "google" as const,
  priority: "backfill" as const,
  cost: 500,
};
let created = false;

describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)(
  "local mail budget against disposable Redis",
  { timeout: 30_000 },
  () => {
    beforeAll(async () => {
      await execute("docker", [
        "run",
        "--detach",
        "--rm",
        "--name",
        container,
        "redis:7",
        "redis-server",
        "--save",
        "",
        "--appendonly",
        "no",
      ]);
      created = true;
      await vi.waitFor(async () => expect(await command("PING")).toBe("PONG"));
    });
    beforeEach(async () => {
      await command("FLUSHDB");
    });
    afterAll(async () => {
      if (created) await execute("docker", ["rm", "--force", container]);
    });

    it("denies an exhausted background bucket atomically while preserving current headroom", async () => {
      await withLocalMailSyncBudget(input, async () => undefined);
      const total = await command(
        "HGET",
        "local-mail-budget:google:account-1:total",
        "tokens",
      );
      const denied = vi.fn();
      await expect(
        withLocalMailSyncBudget(input, denied),
      ).rejects.toBeInstanceOf(LocalMailSyncPausedError);
      expect(denied).not.toHaveBeenCalled();
      expect(
        await command(
          "HGET",
          "local-mail-budget:google:account-1:total",
          "tokens",
        ),
      ).toBe(total);
      await expect(
        withLocalMailSyncBudget(
          { ...input, priority: "current" },
          async () => "current",
        ),
      ).resolves.toBe("current");
    });

    it("applies the shared app limit before debiting an account and refills from Redis time", async () => {
      const now = await redisTime();
      await command(
        "HSET",
        "local-mail-budget:google:total",
        "tokens",
        "0",
        "at",
        String(now + 60_000),
      );
      await expect(
        withLocalMailSyncBudget(input, async () => undefined),
      ).rejects.toBeInstanceOf(LocalMailSyncPausedError);
      expect(
        await command("EXISTS", "local-mail-budget:google:account-1:total"),
      ).toBe(0);
      await command(
        "HSET",
        "local-mail-budget:google:total",
        "at",
        String(now - 60_000),
      );
      await expect(
        withLocalMailSyncBudget(input, async () => "refilled"),
      ).resolves.toBe("refilled");
    });

    it("slows refill after a throttle without consuming tokens on denied work", async () => {
      const key = "local-mail-budget:google:account-1:backfill";
      await command(
        "HSET",
        key,
        "tokens",
        "0",
        "at",
        String((await redisTime()) - 30_000),
      );
      await command(
        "SET",
        "local-mail-budget:google:account-1:recovery",
        "1",
        "PX",
        "300000",
      );
      await expect(
        withLocalMailSyncBudget({ ...input, cost: 200 }, async () => undefined),
      ).rejects.toBeInstanceOf(LocalMailSyncPausedError);
      expect(await command("HGET", key, "tokens")).toBe("0");
      await command("DEL", "local-mail-budget:google:account-1:recovery");
      await expect(
        withLocalMailSyncBudget({ ...input, cost: 200 }, async () => "resumed"),
      ).resolves.toBe("resumed");
    });

    it("enforces account and app concurrency and releases only owned slots", async () => {
      const releases: (() => void)[] = [];
      const pending: Promise<unknown>[] = [];
      try {
        for (let index = 0; index < 8; index++) {
          let release = () => {};
          const held = new Promise<void>((resolve) => {
            release = resolve;
          });
          releases.push(release);
          pending.push(
            withLocalMailSyncBudget(
              { ...input, emailAccountId: `account-${index}`, cost: 20 },
              () => held,
            ),
          );
          if (index === 0) {
            await vi.waitFor(async () =>
              expect(
                await command(
                  "ZCARD",
                  "local-mail-budget:google:account-0:active",
                ),
              ).toBe(1),
            );
            await expect(
              withLocalMailSyncBudget(
                { ...input, emailAccountId: "account-0", cost: 20 },
                async () => undefined,
              ),
            ).rejects.toBeInstanceOf(LocalMailSyncPausedError);
          }
        }
        await vi.waitFor(async () =>
          expect(
            await command("ZCARD", "local-mail-budget:google:active"),
          ).toBe(8),
        );
        await expect(
          withLocalMailSyncBudget(
            { ...input, emailAccountId: "account-0", cost: 20 },
            async () => undefined,
          ),
        ).rejects.toBeInstanceOf(LocalMailSyncPausedError);
        await expect(
          withLocalMailSyncBudget(
            { ...input, emailAccountId: "account-9", cost: 20 },
            async () => undefined,
          ),
        ).rejects.toBeInstanceOf(LocalMailSyncPausedError);
        releases[0]!();
        await pending[0];
        expect(await command("ZCARD", "local-mail-budget:google:active")).toBe(
          7,
        );
        await expect(
          withLocalMailSyncBudget(
            { ...input, emailAccountId: "account-9", cost: 20 },
            async () => "admitted",
          ),
        ).resolves.toBe("admitted");
        expect(await command("ZCARD", "local-mail-budget:google:active")).toBe(
          7,
        );
      } finally {
        for (const release of releases) release();
        await Promise.allSettled(pending);
      }
      expect(await command("ZCARD", "local-mail-budget:google:active")).toBe(0);
    });

    it("persists provider Retry-After and blocks another caller through the shared cooldown reader", async () => {
      const throttled = {
        status: 429,
        response: { headers: { "retry-after": "120" } },
      };
      await expect(
        withLocalMailSyncBudget(input, async () => {
          throw throttled;
        }),
      ).rejects.toBe(throttled);
      const state = JSON.parse(
        (await command("GET", "email-provider-rate-limit:account-1")) as string,
      );
      expect(state.provider).toBe("google");
      expect(Date.parse(state.retryAt)).toBeGreaterThan(Date.now() + 110_000);
      const next = vi.fn();
      await expect(
        withLocalMailSyncBudget({ ...input, priority: "current" }, next),
      ).rejects.toMatchObject({ retryAfterMs: expect.any(Number) });
      expect(next).not.toHaveBeenCalled();
      expect(await command("ZCARD", "local-mail-budget:google:active")).toBe(0);
    });
  },
);

async function command(...args: string[]): Promise<unknown> {
  const { stdout } = await execute("docker", [
    "exec",
    container,
    "redis-cli",
    "--json",
    ...args,
  ]);
  return JSON.parse(stdout);
}
async function redisTime() {
  const time = (await command("TIME")) as [string, string];
  return Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);
}
