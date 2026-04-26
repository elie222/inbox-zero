import { afterEach, describe, expect, it, vi } from "vitest";

describe("encryption without env", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/env");
  });

  it("does not crash on import when encryption env is missing", async () => {
    vi.resetModules();
    vi.doMock("@/env", () => ({
      env: {
        EMAIL_ENCRYPT_SECRET: undefined,
        EMAIL_ENCRYPT_SALT: undefined,
      },
    }));

    const { encryptToken, decryptToken } = await import("./encryption");

    expect(encryptToken("secret")).toBeNull();
    expect(decryptToken("deadbeef")).toBeNull();
  });
});
