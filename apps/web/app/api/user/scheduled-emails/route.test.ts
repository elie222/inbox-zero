import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import prisma from "@/utils/__mocks__/prisma";
import { POST } from "./route";

const processScheduledEmail = vi.hoisted(() => vi.fn());
const authMock = vi.hoisted(() => vi.fn());
const getEmailAccountMock = vi.hoisted(() => vi.fn());

vi.mock("@/utils/scheduled-email/service", async (importActual) => {
  const actual =
    await importActual<typeof import("@/utils/scheduled-email/service")>();
  return { ...actual, processScheduledEmail };
});
vi.mock("@/utils/auth", () => ({ auth: authMock }));
vi.mock("@/utils/redis/account-validation", () => ({
  getEmailAccount: getEmailAccountMock,
}));
vi.mock("@/utils/prisma");

const userId = "user-1";
const emailAccountId = "account-1";
const clientMutationId = "827f1b38-2032-4bfd-bc2c-cbba02746b04";

describe("POST /api/user/scheduled-emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: userId } });
    getEmailAccountMock.mockResolvedValue("developer@example.com");
    processScheduledEmail.mockResolvedValue(undefined);
  });

  it("rejects a request without a session cookie", async () => {
    authMock.mockResolvedValue(null);

    const response = await post(futurePayload(), { cookie: false });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
      isKnownError: true,
    });
    expect(prisma.scheduledEmail.create).not.toHaveBeenCalled();
    expect(processScheduledEmail).not.toHaveBeenCalled();
  });

  it("rejects a session that does not name an email account", async () => {
    const response = await post(futurePayload(), { account: false });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Email account ID is required",
      isKnownError: true,
    });
    expect(getEmailAccountMock).not.toHaveBeenCalled();
  });

  it("rejects an email account the user does not own", async () => {
    getEmailAccountMock.mockResolvedValue(null);

    const response = await post(futurePayload());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid account ID",
      isKnownError: true,
    });
    expect(getEmailAccountMock).toHaveBeenCalledWith({
      userId,
      emailAccountId,
    });
    expect(prisma.scheduledEmail.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid schedule body", async () => {
    const response = await post({
      ...futurePayload(),
      clientMutationId: "not-a-uuid",
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.isKnownError).toBe(true);
    expect(prisma.scheduledEmail.create).not.toHaveBeenCalled();
    expect(processScheduledEmail).not.toHaveBeenCalled();
  });

  it("rejects a send time that is not in the future", async () => {
    rememberCreatedRow();

    const response = await post({
      ...futurePayload(),
      sendAt: "2020-01-01T00:00:00.000Z",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("future"),
      isKnownError: true,
    });
    expect(prisma.scheduledEmail.create).not.toHaveBeenCalled();
    expect(processScheduledEmail).not.toHaveBeenCalled();
  });

  it("stores a future send for the authenticated account and waits for cron", async () => {
    rememberCreatedRow();

    const response = await post({
      ...futurePayload(),
      emailAccountId: "someone-else",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "scheduled-1" });
    expect(authMock).toHaveBeenCalledWith(expect.any(Headers));
    expect(authMock.mock.calls[0][0].get("cookie")).toContain(
      "better-auth.session_token",
    );
    expect(prisma.scheduledEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ emailAccountId }),
      }),
    );
    expect(processScheduledEmail).not.toHaveBeenCalled();
  });

  it("returns the original id when the same client mutation is repeated", async () => {
    rememberCreatedRow();
    const payload = futurePayload();

    const first = await post(payload);
    const second = await post(payload);

    expect(await first.json()).toEqual({ id: "scheduled-1" });
    expect(await second.json()).toEqual({ id: "scheduled-1" });
    expect(prisma.scheduledEmail.create).toHaveBeenCalledOnce();
    expect(processScheduledEmail).not.toHaveBeenCalled();
  });

  it("rejects a reused client mutation id that carries a different email", async () => {
    rememberCreatedRow();
    expect((await post(futurePayload())).status).toBe(200);

    const response = await post({
      ...futurePayload(),
      email: { ...futurePayload().email, subject: "Different" },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("different email"),
      isKnownError: true,
    });
    expect(prisma.scheduledEmail.create).toHaveBeenCalledOnce();
  });

  it("sends immediately when sendAt is null, including an identical retry", async () => {
    rememberCreatedRow();
    const payload = { ...futurePayload(), sendAt: null };

    expect((await post(payload)).status).toBe(200);
    expect((await post(payload)).status).toBe(200);

    expect(processScheduledEmail).toHaveBeenCalledTimes(2);
    expect(processScheduledEmail).toHaveBeenCalledWith(
      "scheduled-1",
      expect.objectContaining({ error: expect.any(Function) }),
    );
    expect(prisma.scheduledEmail.create).toHaveBeenCalledOnce();
  });
});

function futurePayload() {
  return {
    clientMutationId,
    threadId: null,
    messageIds: [] as string[],
    email: {
      to: "teammate@example.com",
      subject: "Later",
      messageHtml: "<p>Hello</p>",
    },
    sendAt: "2099-01-01T00:00:00.000Z",
    remindAt: null,
  };
}

function rememberCreatedRow() {
  let stored: { id: string; payloadHash: string; status: string } | null = null;
  prisma.scheduledEmail.findUnique.mockImplementation(
    async () => stored as never,
  );
  prisma.scheduledEmail.create.mockImplementation(async ({ data }) => {
    stored = {
      id: "scheduled-1",
      payloadHash: String(data.payloadHash),
      status: "PENDING",
    };
    return stored as never;
  });
}

function post(
  body: unknown,
  options: { cookie?: boolean; account?: boolean } = {},
) {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.cookie !== false) {
    headers.set("cookie", "better-auth.session_token=session");
  }
  if (options.account !== false) {
    headers.set(EMAIL_ACCOUNT_HEADER, emailAccountId);
  }
  return POST(
    new NextRequest("http://127.0.0.1/api/user/scheduled-emails", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) },
  );
}
