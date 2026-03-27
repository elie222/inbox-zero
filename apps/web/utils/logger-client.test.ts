import { log } from "next-axiom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClientLogger } from "./logger-client";

const { mockedEnv } = vi.hoisted(() => ({
  mockedEnv: {
    NEXT_PUBLIC_AXIOM_TOKEN: undefined as string | undefined,
  },
}));

vi.mock("next-axiom", () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/env", () => ({
  env: mockedEnv,
}));

describe("createClientLogger", () => {
  beforeEach(() => {
    mockedEnv.NEXT_PUBLIC_AXIOM_TOKEN = undefined;
    vi.clearAllMocks();
  });

  it("logs trace to console and resolves lazy args without axiom", () => {
    const consoleDebugSpy = vi
      .spyOn(console, "debug")
      .mockImplementation(() => {});

    const logger = createClientLogger("client-test");

    logger.trace("Tracing details", () => ({ foo: "bar" }));

    expect(consoleDebugSpy).toHaveBeenCalledWith(
      "[client-test]:",
      "Tracing details",
      { foo: "bar" },
    );
    expect(log.debug).not.toHaveBeenCalled();
  });

  it("logs trace through axiom when the public token is configured", () => {
    mockedEnv.NEXT_PUBLIC_AXIOM_TOKEN = "public-token";

    const logger = createClientLogger("client-test");

    logger.trace("Tracing details", { foo: "bar" });

    expect(log.debug).toHaveBeenCalledWith("Tracing details", {
      scope: "client-test",
      foo: "bar",
    });
  });
});
