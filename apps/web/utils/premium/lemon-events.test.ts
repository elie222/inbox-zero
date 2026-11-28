import { createHmac } from "node:crypto";
import { after } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { POST } from "@/app/api/lemon-squeezy/webhook/route";
import type { EventName } from "@/app/api/lemon-squeezy/webhook/types";
import { getLemonSubscription } from "@/ee/billing/lemon";
import { applyLemonSubscriptionEvent, upgradeToPremiumLemon } from "./server";

vi.mock("@/utils/prisma");
vi.mock("next/server", () => ({
  after: vi.fn(),
  NextResponse: { json: (body: object) => Response.json(body) },
}));
vi.mock("@/env", () => ({
  env: {
    LEMON_SQUEEZY_SIGNING_SECRET: "test-secret",
    NEXT_PUBLIC_BASIC_MONTHLY_VARIANT_ID: 5,
    NEXT_PUBLIC_PRO_MONTHLY_VARIANT_ID: 6,
  },
}));
vi.mock("@/utils/middleware", () => ({
  withError:
    (_route: string, handler: (request: Request) => Promise<Response>) =>
    (request: Request) =>
      handler(
        Object.assign(request, { logger: { info: vi.fn(), error: vi.fn() } }),
      ),
}));
vi.mock("@/utils/logger", () => ({
  createScopedLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/utils/error", () => ({ SafeError: Error }));
vi.mock("@/utils/date", () => ({}));
vi.mock("@/utils/posthog", () => ({}));
vi.mock("@inboxzero/loops", () => ({}));
vi.mock("@/ee/billing/lemon", () => ({ getLemonSubscription: vi.fn() }));
vi.mock("@/utils/email/watch-manager", () => ({
  ensureEmailAccountsWatched: vi.fn(),
}));

type Row = {
  renewsAt: Date | null;
  eventAt: Date | null;
  eventPriority?: number;
  subscriptionId?: number | null;
  variantId?: number;
  tier?: string;
};

// Minimal in-memory premium row that honours the `lemonSqueezyEventAt` guard.
function mockPremiumRow(row: Row) {
  prisma.premium.update.mockImplementation((async ({ data }: any) => {
    row.renewsAt = data.lemonSqueezyRenewsAt ?? row.renewsAt;
    return { users: [{ email: "user@example.com" }] };
  }) as any);
  prisma.premium.updateMany.mockImplementation((async ({
    where,
    data,
  }: any) => {
    const guard = where.OR as Array<{
      lemonSqueezyEventAt: Date | { lt?: Date; lte?: Date } | null;
      lemonSqueezyEventPriority?: { lt: number };
    }>;
    const allowed = guard.some(
      ({ lemonSqueezyEventAt: time, lemonSqueezyEventPriority: priority }) => {
        if (time === null) return row.eventAt === null;
        if (!row.eventAt) return false;
        if (time instanceof Date) {
          return (
            row.eventAt.getTime() === time.getTime() &&
            !!priority &&
            (row.eventPriority ?? 0) < priority.lt
          );
        }
        return time.lt
          ? row.eventAt < time.lt
          : !!time.lte && row.eventAt <= time.lte;
      },
    );
    const subscriptionId =
      row.subscriptionId === undefined ? 1 : row.subscriptionId;
    const matchesSubscription =
      !where.AND ||
      where.AND.OR.some(
        (match: {
          lemonSqueezySubscriptionId: number | null;
          lemonSqueezyVariantId?: number;
        }) =>
          subscriptionId === match.lemonSqueezySubscriptionId &&
          (match.lemonSqueezyVariantId === undefined ||
            row.variantId === match.lemonSqueezyVariantId),
      );
    if (!allowed || !matchesSubscription) return { count: 0 };
    row.renewsAt = data.lemonSqueezyRenewsAt;
    row.eventAt = data.lemonSqueezyEventAt;
    row.eventPriority = data.lemonSqueezyEventPriority;
    row.subscriptionId = data.lemonSqueezySubscriptionId ?? row.subscriptionId;
    row.variantId = data.lemonSqueezyVariantId ?? row.variantId;
    row.tier = data.tier ?? row.tier;
    return { count: 1 };
  }) as any);
  prisma.premium.findUnique.mockResolvedValue({ users: [] } as any);
  prisma.premium.findFirst.mockResolvedValue({ id: "premium-1" } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Lemon Squeezy subscription event ordering", () => {
  const endsAt = new Date("2026-12-01T00:00:00Z");
  const staleRenewsAt = new Date("2027-01-01T00:00:00Z");

  it("ignores a late subscription_updated that is older than a cancellation", async () => {
    const row: Row = { renewsAt: null, eventAt: null };
    mockPremiumRow(row);

    await applyLemonSubscriptionEvent({
      premiumId: "premium-1",
      subscriptionId: 1,
      variantId: 5,
      isCutoff: true,
      lemonSqueezyRenewsAt: endsAt,
      eventAt: new Date("2026-11-27T10:00:02Z"),
    });
    const result = await applyLemonSubscriptionEvent({
      premiumId: "premium-1",
      subscriptionId: 1,
      variantId: 5,
      isCutoff: false,
      lemonSqueezyRenewsAt: staleRenewsAt,
      eventAt: new Date("2026-11-27T10:00:01Z"),
    });

    expect(result).toBeNull();
    expect(row.renewsAt).toEqual(endsAt);
  });

  it("applies a newer subscription_updated", async () => {
    const row: Row = { renewsAt: null, eventAt: null };
    mockPremiumRow(row);

    await applyLemonSubscriptionEvent({
      premiumId: "premium-1",
      subscriptionId: 1,
      variantId: 5,
      isCutoff: false,
      lemonSqueezyRenewsAt: endsAt,
      eventAt: new Date("2026-11-27T10:00:01Z"),
    });
    const result = await applyLemonSubscriptionEvent({
      premiumId: "premium-1",
      subscriptionId: 1,
      variantId: 5,
      isCutoff: false,
      lemonSqueezyRenewsAt: staleRenewsAt,
      eventAt: new Date("2026-11-27T10:00:02Z"),
    });

    expect(result).not.toBeNull();
    expect(row.renewsAt).toEqual(staleRenewsAt);
  });

  const upgradeOptions = {
    userId: "user-1",
    tier: "PRO_MONTHLY" as any,
    lemonSqueezyRenewsAt: staleRenewsAt,
    lemonSqueezySubscriptionId: 1,
    lemonSqueezySubscriptionItemId: 2,
    lemonSqueezyOrderId: null,
    lemonSqueezyCustomerId: 3,
    lemonSqueezyProductId: 4,
    lemonSqueezyVariantId: 5,
  };

  it("ignores a late subscription_created / plan_changed after a cancellation", async () => {
    const row: Row = { renewsAt: null, eventAt: null };
    mockPremiumRow(row);
    prisma.user.findUnique.mockResolvedValue({ premiumId: "premium-1" } as any);

    await applyLemonSubscriptionEvent({
      premiumId: "premium-1",
      subscriptionId: 1,
      variantId: 5,
      isCutoff: true,
      lemonSqueezyRenewsAt: endsAt,
      eventAt: new Date("2026-11-27T10:00:02Z"),
    });
    const result = await upgradeToPremiumLemon({
      ...upgradeOptions,
      eventAt: new Date("2026-11-27T10:00:01Z"),
    });

    expect(result).toBeNull();
    expect(row.renewsAt).toEqual(endsAt);
  });

  it("applies a newer subscription_created and records its event time", async () => {
    const row: Row = { renewsAt: null, eventAt: null };
    mockPremiumRow(row);
    prisma.user.findUnique.mockResolvedValue({ premiumId: "premium-1" } as any);

    const result = await upgradeToPremiumLemon({
      ...upgradeOptions,
      eventAt: new Date("2026-11-27T10:00:03Z"),
    });

    expect(result).not.toBeNull();
    expect(row.renewsAt).toEqual(staleRenewsAt);
    expect(row.eventAt).toEqual(new Date("2026-11-27T10:00:03Z"));
  });
});

async function sendEvent(
  name: EventName,
  attributes: Record<string, unknown>,
  type = "subscriptions",
) {
  const body = JSON.stringify({
    meta: { event_name: name, custom_data: { user_id: "user-1" } },
    data: { id: "1", type, attributes },
  });
  const signature = createHmac("sha256", "test-secret")
    .update(body)
    .digest("hex");
  const request = new Request("http://localhost/api/lemon-squeezy/webhook", {
    method: "POST",
    body,
    headers: { "x-signature": signature },
  });
  const result = await POST(request as Parameters<typeof POST>[0]);
  expect(result.status).toBe(200);
}

describe("Lemon Squeezy webhook updates", () => {
  const earlier = "2026-11-27T10:00:01Z";
  const later = "2026-11-27T10:00:02Z";
  const snapshot = {
    customer_id: 3,
    product_id: 4,
    variant_id: 6,
    first_subscription_item: { id: 2, subscription_id: 1 },
    renews_at: "2027-01-01T00:00:00Z",
    updated_at: later,
    status: "active",
  };
  const endsAt = "2026-12-01T00:00:00Z";

  it("applies the plan in a newer subscription snapshot before ignoring an older plan change", async () => {
    const row: Row = { renewsAt: null, eventAt: null, tier: "BASIC_MONTHLY" };
    mockPremiumRow(row);
    prisma.user.findUnique.mockResolvedValue({ premiumId: "premium-1" } as any);

    await sendEvent("subscription_updated", snapshot);
    await sendEvent("subscription_plan_changed", {
      ...snapshot,
      updated_at: earlier,
      renews_at: endsAt,
    });

    expect(row).toMatchObject({
      tier: "PRO_MONTHLY",
      variantId: 6,
      renewsAt: new Date(snapshot.renews_at),
      eventAt: new Date(later),
    });
  });

  it.each([
    true,
    false,
  ])("keeps the cancellation on a timestamp tie (cancel first: %s)", async (cancelFirst) => {
    const row: Row = { renewsAt: null, eventAt: null };
    mockPremiumRow(row);
    const cancel = () =>
      sendEvent("subscription_cancelled", {
        ...snapshot,
        status: "cancelled",
        ends_at: endsAt,
      });
    const renew = () => sendEvent("subscription_updated", snapshot);

    const events = cancelFirst ? [cancel, renew] : [renew, cancel];
    for (const event of events) await event();

    expect(row.renewsAt).toEqual(new Date(endsAt));
  });

  it("applies plan change effects once when the matching update arrived first", async () => {
    const row: Row = { renewsAt: null, eventAt: null };
    mockPremiumRow(row);
    prisma.user.findUnique.mockResolvedValue({ premiumId: "premium-1" } as any);

    await sendEvent("subscription_updated", snapshot);
    await sendEvent("subscription_plan_changed", snapshot);
    await sendEvent("subscription_plan_changed", snapshot);

    expect(after).toHaveBeenCalledTimes(1);
  });

  it("uses the subscription timestamp and ID for a failed invoice", async () => {
    const row: Row = {
      renewsAt: new Date(snapshot.renews_at),
      eventAt: new Date(later),
    };
    mockPremiumRow(row);
    vi.mocked(getLemonSubscription).mockResolvedValue({
      data: { data: { attributes: { ...snapshot, status: "past_due" } } },
    } as Awaited<ReturnType<typeof getLemonSubscription>>);

    await sendEvent(
      "subscription_payment_failed",
      {
        customer_id: 3,
        subscription_id: 1,
        updated_at: earlier,
      },
      "subscription-invoices",
    );

    expect(getLemonSubscription).toHaveBeenCalledWith(1);
    expect(row.renewsAt).toEqual(new Date(later));
  });

  it("keeps the current subscription when a failed invoice belongs to an older subscription", async () => {
    const row: Row = {
      renewsAt: new Date(snapshot.renews_at),
      eventAt: new Date(earlier),
      subscriptionId: 2,
    };
    mockPremiumRow(row);
    vi.mocked(getLemonSubscription).mockResolvedValue({
      data: { data: { attributes: { ...snapshot, status: "past_due" } } },
    } as Awaited<ReturnType<typeof getLemonSubscription>>);

    await sendEvent(
      "subscription_payment_failed",
      {
        customer_id: 3,
        subscription_id: 1,
        updated_at: later,
      },
      "subscription-invoices",
    );

    expect(row.renewsAt).toEqual(new Date(snapshot.renews_at));
    expect(row.subscriptionId).toBe(2);
  });

  it("does not cut off a recovered subscription when an old failed invoice arrives", async () => {
    const row: Row = {
      renewsAt: new Date(snapshot.renews_at),
      eventAt: new Date(earlier),
    };
    mockPremiumRow(row);
    vi.mocked(getLemonSubscription).mockResolvedValue({
      data: { data: { attributes: snapshot } },
    } as Awaited<ReturnType<typeof getLemonSubscription>>);

    await sendEvent(
      "subscription_payment_failed",
      {
        customer_id: 3,
        subscription_id: 1,
        updated_at: later,
      },
      "subscription-invoices",
    );

    expect(row.renewsAt).toEqual(new Date(snapshot.renews_at));
  });
});
