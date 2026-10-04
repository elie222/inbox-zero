import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import { pollFastmailAccount } from "@/utils/fastmail/poll-sync";
import { POST } from "./route";

vi.mock("@/env", () => ({ env: { INTERNAL_API_KEY: "fixture-worker-key" } }));
vi.mock("@/utils/fastmail/poll-sync", () => ({ pollFastmailAccount: vi.fn() }));
vi.mock("@/utils/middleware", () => ({
  withError:
    (_name: string, handler: (request: NextRequest) => Promise<Response>) =>
    (request: NextRequest) =>
      handler(Object.assign(request, { logger: createScopedLogger("test") })),
}));

describe("Fastmail worker boundary", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects processing without internal authentication", async () => {
    const response = await POST(request(undefined));
    expect(response.status).toBe(401);
    expect(pollFastmailAccount).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without processing an account", async () => {
    const response = await POST(request("fixture-worker-key", "{"));
    expect(response.status).toBe(400);
    expect(pollFastmailAccount).not.toHaveBeenCalled();
  });

  it("returns a retryable HTTP failure when durable work remains pending", async () => {
    vi.mocked(pollFastmailAccount).mockResolvedValue({
      status: "error",
      emailAccountId: "fixture-account",
      email: "",
      error: "Processing failed",
    });
    expect((await POST(request("fixture-worker-key"))).status).toBe(503);
  });

  it("accepts successful processing without changing queue retry behavior", async () => {
    vi.mocked(pollFastmailAccount).mockResolvedValue({
      status: "success",
      emailAccountId: "fixture-account",
      email: "fixture@example.com",
      processedCount: 1,
    });
    const response = await POST(request("fixture-worker-key"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ processedCount: 1 });
  });
});

function request(key?: string, body = '{"emailAccountId":"fixture-account"}') {
  return new NextRequest("http://localhost/api/fastmail/process", {
    method: "POST",
    headers: key ? { "x-api-key": key } : undefined,
    body,
  });
}
