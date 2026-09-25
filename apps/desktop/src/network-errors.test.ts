import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { isTransientNetworkError } from "./network-errors";

describe("isTransientNetworkError", () => {
  it("recognizes a real fetch that cannot connect", async () => {
    const port = await closedPort();
    const error = await fetch(`http://127.0.0.1:${port}`).catch(
      (error) => error,
    );
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("recognizes connectivity failures from the engine and updater", () => {
    expect(
      isTransientNetworkError(
        new TypeError("fetch failed", { cause: socketError("ENOTFOUND") }),
      ),
    ).toBe(true);
    expect(
      isTransientNetworkError(
        new TypeError("fetch failed", {
          cause: new AggregateError(
            [socketError("ETIMEDOUT"), socketError("ENETUNREACH")],
            "connect failed",
          ),
        }),
      ),
    ).toBe(true);
    expect(
      isTransientNetworkError(new DOMException("timed out", "TimeoutError")),
    ).toBe(true);
    expect(isTransientNetworkError(new Error("net::ERR_NETWORK_CHANGED"))).toBe(
      true,
    );
  });

  it("keeps reporting failures that point at a real problem", () => {
    expect(
      isTransientNetworkError(
        new TypeError("fetch failed", {
          cause: socketError("CERT_HAS_EXPIRED"),
        }),
      ),
    ).toBe(false);
    expect(
      isTransientNetworkError(
        new TypeError("fetch failed", {
          cause: new AggregateError(
            [socketError("ETIMEDOUT"), socketError("CERT_HAS_EXPIRED")],
            "connect failed",
          ),
        }),
      ),
    ).toBe(false);
    expect(
      isTransientNetworkError(new Error("net::ERR_CERT_AUTHORITY_INVALID")),
    ).toBe(false);
    expect(isTransientNetworkError(new Error("fetch failed"))).toBe(false);
    expect(isTransientNetworkError(new Error("database is locked"))).toBe(
      false,
    );
  });
});

function socketError(code: string) {
  return Object.assign(new Error(code), { code });
}

async function closedPort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  if (!address || typeof address === "string") throw new Error("no port");
  return address.port;
}
