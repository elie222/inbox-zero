import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUuid } from "./uuid";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("randomUuid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a v4 UUID", () => {
    expect(randomUuid()).toMatch(UUID_V4_REGEX);
  });

  it("falls back when crypto.randomUUID is unavailable (insecure context)", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (array: Uint8Array) => webcrypto.getRandomValues(array),
    });

    const first = randomUuid();
    const second = randomUuid();

    expect(first).toMatch(UUID_V4_REGEX);
    expect(second).toMatch(UUID_V4_REGEX);
    expect(first).not.toEqual(second);
  });
});
