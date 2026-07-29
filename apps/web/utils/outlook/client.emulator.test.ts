import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("OutlookClient with Microsoft emulator", () => {
  let server: Server | undefined;

  afterEach(async () => {
    vi.doUnmock("@/env");
    vi.doUnmock("@/utils/auth/save-tokens");
    vi.doUnmock("@/utils/auth/cleanup-invalid-tokens");
    vi.resetModules();

    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  it("authorizes requests to an HTTP Microsoft emulator", async () => {
    let authorizationHeader: string | undefined;

    server = createServer((request, response) => {
      authorizationHeader = request.headers.authorization;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: "user-id" }));
    });

    const port = await new Promise<number>((resolve, reject) => {
      server?.listen(0, "127.0.0.1", () => {
        const address = server?.address();
        if (typeof address === "object" && address) resolve(address.port);
        else reject(new Error("Failed to start test server"));
      });
    });

    vi.doMock("@/env", () => ({
      env: {
        MICROSOFT_BASE_URL: `http://127.0.0.1:${port}`,
        NODE_ENV: "test",
      },
    }));
    vi.doMock("@/utils/auth/save-tokens", () => ({
      saveTokens: vi.fn(),
    }));
    vi.doMock("@/utils/auth/cleanup-invalid-tokens", () => ({
      cleanupInvalidTokens: vi.fn(),
    }));

    const [{ createOutlookClient }, { createScopedLogger }] = await Promise.all(
      [import("./client"), import("@/utils/logger")],
    );

    const client = createOutlookClient(
      "emulator-token",
      createScopedLogger("test"),
    );
    await client.getClient().api("/me").get();

    expect(authorizationHeader).toBe("Bearer emulator-token");
  });
});
