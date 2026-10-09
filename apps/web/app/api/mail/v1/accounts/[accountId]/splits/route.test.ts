import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { auth } from "@/utils/auth";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailAccount } from "@/utils/redis/account-validation";
import { toggleRule } from "@/utils/rule/toggle-rule";
import { SafeError } from "@/utils/error";
import { POST } from "./route";
import { PATCH, DELETE } from "./[splitId]/route";
import { POST as reorder } from "./reorder/route";
import { GET as presets } from "./presets/route";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({ auth: vi.fn() }));
vi.mock("@/utils/redis/account-validation", () => ({
  getEmailAccount: vi.fn(),
}));
vi.mock("@/utils/email/provider", () => ({ createEmailProvider: vi.fn() }));
vi.mock("@/utils/email/rate-limit", () => ({
  recordRateLimitFromApiError: vi.fn(),
}));
vi.mock("@/utils/error.server");
vi.mock("@/utils/rule/toggle-rule", () => ({ toggleRule: vi.fn() }));

const draft = { name: "Unread", filters: [{ kind: "UNREAD", value: null }] };
const saved = { id: "split-1", ...draft, order: 1, matchAll: true };
const handlers = [POST, PATCH, DELETE, reorder, presets];

describe("mail v1 split routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1" } } as never);
    vi.mocked(getEmailAccount).mockResolvedValue("user@example.com");
    prisma.emailAccount.findUnique.mockResolvedValue({
      account: { provider: "google" },
      mailSplits: [saved],
    } as never);
    vi.mocked(createEmailProvider).mockResolvedValue({
      name: "google",
      getLabels: vi
        .fn()
        .mockResolvedValue([
          { id: "receipt-1", name: "Receipt", type: "user" },
        ]),
    } as never);
    prisma.$transaction.mockResolvedValue([[], { count: 1 }] as never);
  });

  it.each(
    handlers,
  )("requires authentication before touching splits (%#)", async (handler) => {
    vi.mocked(auth).mockResolvedValue(null);
    const response = await handler(request("POST", draft), context());
    expect(response.status).toBe(401);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(
    handlers,
  )("rejects accounts the user does not own (%#)", async (handler) => {
    vi.mocked(getEmailAccount).mockResolvedValue(null);
    const response = await handler(request("POST", draft), context());
    expect(response.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(
    handlers,
  )("rejects a path/header account mismatch (%#)", async (handler) => {
    const response = await handler(
      request("POST", draft),
      context("other-account"),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "forbidden" },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates a split and returns the settings split shape", async () => {
    prisma.$transaction.mockResolvedValue([
      [],
      [{ status: "created", ...saved }],
      1,
    ] as never);
    const response = await POST(request("POST", draft), context());
    expect(response.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({
      protocolVersion: 1,
      requestId: "test-request",
      splits: [{ id: "all", filters: [] }, saved],
    });
  });

  it("updates using the path ID rather than a body ID", async () => {
    const response = await PATCH(
      request("PATCH", { ...draft, id: "foreign-split" }),
      context(),
    );
    expect(response.status).toBe(200);
    expect(prisma.mailSplit.updateMany).toHaveBeenCalledWith({
      where: { id: "split-1", emailAccountId: "acc-1" },
      data: { name: "Unread", matchAll: true },
    });
    expect(prisma.mailSplitFilter.deleteMany).toHaveBeenCalledWith({
      where: { mailSplitId: "split-1", mailSplit: { emailAccountId: "acc-1" } },
    });
    expect(await response.json()).toHaveProperty("splits");
  });

  it("deletes only removable splits in the authenticated account", async () => {
    const response = await DELETE(request("DELETE"), context());
    expect(response.status).toBe(200);
    expect(prisma.mailSplit.deleteMany).toHaveBeenCalledWith({
      where: { id: "split-1", emailAccountId: "acc-1", filters: { some: {} } },
    });
    expect(await response.json()).toHaveProperty("splits");
  });

  it("rejects deleting All or another missing/locked split with the web error", async () => {
    prisma.$transaction.mockResolvedValue([[], { count: 0 }] as never);
    const response = await DELETE(request("DELETE"), context("acc-1", "all"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "invalid",
        message: "Split not found or cannot be removed",
      },
    });
  });

  it("reorders through the shared account-scoped transaction", async () => {
    const response = await reorder(
      request("POST", { ids: ["split-2", "split-1"] }),
      context(),
    );
    expect(response.status).toBe(200);
    expect(prisma.$executeRaw).toHaveBeenCalledWith(
      expect.anything(),
      "acc-1",
      ["split-2", "split-1"],
      ["split-2", "split-1"],
    );
    expect(await response.json()).toHaveProperty("splits");
  });

  it.each([
    [POST, { ...draft, filters: [{ kind: "LABEL", value: null }] }],
    [PATCH, { name: "" }],
    [
      POST,
      {
        ...draft,
        matchAll: true,
        filters: [
          { kind: "FROM", value: "a@example.com" },
          { kind: "FROM", value: "b@example.com" },
        ],
      },
    ],
    [reorder, { ids: ["split-1", "split-1"] }],
    [reorder, { ids: [] }],
    [POST, { presetId: "missing" }],
  ])("rejects invalid input before writing (%#)", async (handler, body) => {
    const response = await handler(request("POST", body), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "invalid", retryable: false },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(toggleRule).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/mail/v1/accounts/acc-1/splits", {
        method: "POST",
        headers: { [EMAIL_ACCOUNT_HEADER]: "acc-1" },
        body: "{",
      }),
      context(),
    );
    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a mismatched account in the body before writing", async () => {
    const response = await POST(
      request("POST", { ...draft, accountId: "other-account" }),
      context(),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "forbidden" },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an unsupported body protocol version", async () => {
    const response = await POST(
      request("POST", { ...draft, protocolVersion: 2 }),
      context(),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "unsupported_version" },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an unsupported query protocol version before resolving labels", async () => {
    const response = await presets(
      new NextRequest(
        "http://localhost/api/mail/v1/accounts/acc-1/splits/presets?protocolVersion=2",
        { headers: { [EMAIL_ACCOUNT_HEADER]: "acc-1" } },
      ),
      context(),
    );
    expect(response.status).toBe(409);
    expect(prisma.emailAccount.findUnique).toHaveBeenCalledTimes(1);
    const provider = await vi.mocked(createEmailProvider).mock.results[0].value;
    expect(provider.getLabels).not.toHaveBeenCalled();
  });

  it("rejects updating another account's split with the web not-found error", async () => {
    prisma.$transaction.mockResolvedValue([
      [],
      { count: 0 },
      { count: 0 },
      0,
    ] as never);
    const response = await PATCH(
      request("PATCH", draft),
      context("acc-1", "foreign-split"),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { message: "Split not found" },
    });
    expect(prisma.mailSplit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailAccountId: "acc-1", id: "foreign-split" },
      }),
    );
  });

  it.each([
    ["duplicate", 'You already have a "Unread" split.'],
    ["limit", "You can only have 14 splits."],
  ])("preserves the web create error for %s", async (status, message) => {
    prisma.$transaction.mockResolvedValue([[], [{ status }], 0] as never);
    const response = await POST(request("POST", draft), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "invalid", message },
    });
  });

  it("returns a safe rule-toggle failure without claiming a new split", async () => {
    vi.mocked(toggleRule).mockRejectedValueOnce(
      new SafeError("Failed to create rule"),
    );
    const response = await POST(
      request("POST", { presetId: "OTP" }),
      context(),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { message: "Failed to create rule" },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates an ordinary preset with account-resolved filters", async () => {
    prisma.$transaction.mockResolvedValue([
      [],
      [{ status: "created", ...saved }],
      1,
    ] as never);
    const response = await POST(
      request("POST", { presetId: "Receipts" }),
      context(),
    );
    expect(response.status).toBe(200);
    expect(prisma.$queryRaw).toHaveBeenCalledWith(
      expect.anything(),
      "acc-1",
      "Receipts",
      "acc-1",
      expect.any(String),
      "Receipts",
      true,
      "acc-1",
      14,
    );
    expect(prisma.$executeRaw).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.stringContaining('"value":"receipt-1"'),
      expect.any(String),
    );
    expect(toggleRule).not.toHaveBeenCalled();
  });

  it("enables OTP through the same shared rule toggle as web", async () => {
    const response = await POST(
      request("POST", { presetId: "OTP" }),
      context(),
    );
    expect(response.status).toBe(200);
    expect(toggleRule).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "acc-1",
        systemType: "OTP",
        ruleId: undefined,
        enabled: true,
        provider: "google",
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(await response.json()).toHaveProperty("splits");
  });

  it("resolves presets, hides unavailable labels, and marks matching splits", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      account: { provider: "google" },
      mailSplits: [
        {
          ...saved,
          name: "rEcEiPtS",
          filters: [{ kind: "LABEL", value: "receipt-1" }],
        },
      ],
    } as never);
    const response = await presets(request("GET"), context());
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.presets).toContainEqual(
      expect.objectContaining({
        presetId: "Receipts",
        filters: [{ kind: "LABEL", value: "receipt-1" }],
        added: true,
        splitId: "split-1",
      }),
    );
    expect(result.presets).toContainEqual(
      expect.objectContaining({
        presetId: "Important",
        filters: [{ kind: "LABEL", value: "IMPORTANT" }],
      }),
    );
    expect(result.presets).toContainEqual(
      expect.objectContaining({
        presetId: "OTP",
        filters: [],
        createsSystemType: "OTP",
      }),
    );
    expect(
      result.presets.some(
        (entry: { presetId: string }) => entry.presetId === "To Reply",
      ),
    ).toBe(false);
  });

  it("matches unordered preset filters and system presets by name like web", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      account: { provider: "google" },
      mailSplits: [
        {
          ...saved,
          id: "github-split",
          name: "GitHub",
          matchAll: false,
          filters: [
            { kind: "FROM", value: "notifications@github.com" },
            { kind: "FROM", value: "mentions@noreply.github.com" },
          ],
        },
        {
          ...saved,
          id: "otp-split",
          name: "otp",
          filters: [{ kind: "LABEL", value: "account-otp-label" }],
        },
      ],
    } as never);
    const response = await presets(request("GET"), context());
    const result = await response.json();
    expect(result.presets).toContainEqual(
      expect.objectContaining({
        presetId: "GitHub",
        added: true,
        splitId: "github-split",
      }),
    );
    expect(result.presets).toContainEqual(
      expect.objectContaining({
        presetId: "OTP",
        added: true,
        splitId: "otp-split",
      }),
    );
  });

  it("does not mark a modified ordinary preset as added", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      account: { provider: "google" },
      mailSplits: [
        {
          ...saved,
          name: "Receipts",
          matchAll: false,
          filters: [{ kind: "LABEL", value: "receipt-1" }],
        },
      ],
    } as never);
    const response = await presets(request("GET"), context());
    const result = await response.json();
    expect(result.presets).toContainEqual(
      expect.objectContaining({
        presetId: "Receipts",
        added: false,
        splitId: null,
      }),
    );
  });

  it("includes hidden user labels but ignores similarly named system labels", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue({
      name: "google",
      getLabels: vi.fn().mockResolvedValue([
        {
          id: "hidden-receipt",
          name: "Receipt",
          type: "user",
          labelListVisibility: "labelHide",
        },
        { id: "system-to-reply", name: "To Reply", type: "system" },
      ]),
    } as never);
    const response = await presets(request("GET"), context());
    const result = await response.json();
    expect(result.presets).toContainEqual(
      expect.objectContaining({
        presetId: "Receipts",
        filters: [{ kind: "LABEL", value: "hidden-receipt" }],
      }),
    );
    expect(
      result.presets.some(
        (entry: { presetId: string }) => entry.presetId === "To Reply",
      ),
    ).toBe(false);
  });

  it("hides unsupported Starred and Gmail importance on Microsoft", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue({
      name: "microsoft",
      getLabels: vi.fn().mockResolvedValue([]),
    } as never);
    const response = await presets(request("GET"), context());
    const result = await response.json();
    expect(
      result.presets.some((entry: { presetId: string }) =>
        ["Starred", "Important"].includes(entry.presetId),
      ),
    ).toBe(false);
  });

  it("rejects unavailable presets instead of creating empty splits", async () => {
    const response = await POST(
      request("POST", { presetId: "To Reply" }),
      context(),
    );
    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

function request(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/mail/v1/accounts/acc-1/splits", {
    method,
    headers: {
      [EMAIL_ACCOUNT_HEADER]: "acc-1",
      "x-request-id": "test-request",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function context(accountId = "acc-1", splitId = "split-1") {
  return { params: Promise.resolve({ accountId, splitId }) };
}
