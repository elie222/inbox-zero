import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import { enqueueFastmailSync } from "@/utils/fastmail/queue";
import { POST } from "./route";

vi.mock("@/env", () => ({
  env: { FASTMAIL_WEBHOOK_SECRET: "fixture-webhook-secret" },
}));
vi.mock("@/utils/fastmail/queue", () => ({ enqueueFastmailSync: vi.fn() }));
vi.mock("@/utils/middleware", () => ({
  withError:
    (_name: string, handler: (request: NextRequest) => Promise<Response>) =>
    (request: NextRequest) =>
      handler(Object.assign(request, { logger: createScopedLogger("test") })),
}));

describe("Fastmail notification intake", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    undefined,
    "Bearer wrong-secret",
  ])("rejects unauthorized notifications before enqueueing (%s)", async (authorization) => {
    const response = await POST(request(authorization));
    expect(response.status).toBe(401);
    expect(enqueueFastmailSync).not.toHaveBeenCalled();
  });

  it("rejects malformed notifications", async () => {
    const response = await POST(request("Bearer fixture-webhook-secret", "{"));
    expect(response.status).toBe(400);
    expect(enqueueFastmailSync).not.toHaveBeenCalled();
  });

  it("acknowledges only after the queue accepts the job", async () => {
    let accept = () => {};
    vi.mocked(enqueueFastmailSync).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          accept = resolve;
        }),
    );
    let acknowledged = false;
    const response = POST(request("Bearer fixture-webhook-secret")).then(
      (value) => {
        acknowledged = true;
        return value;
      },
    );
    await vi.waitFor(() => expect(enqueueFastmailSync).toHaveBeenCalled());
    expect(acknowledged).toBe(false);
    accept();
    expect((await response).status).toBe(202);
  });

  it("does not acknowledge a notification when Redis is unavailable", async () => {
    vi.mocked(enqueueFastmailSync).mockRejectedValue(
      new Error("Redis unavailable"),
    );
    await expect(
      POST(request("Bearer fixture-webhook-secret")),
    ).rejects.toThrow("Redis unavailable");
  });
});

function request(
  authorization?: string,
  body = '{"emailAccountId":"fixture-account"}',
) {
  return new NextRequest("http://localhost/api/fastmail/webhook", {
    method: "POST",
    headers: authorization ? { authorization } : undefined,
    body,
  });
}
