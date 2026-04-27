import { afterEach, describe, expect, it, vi } from "vitest";
import { SafeError } from "@/utils/error";

const { featureEnv } = vi.hoisted(() => ({
  featureEnv: {
    NEXT_PUBLIC_CLEANER_ENABLED: false,
  },
}));

vi.mock("@/env", () => ({
  env: featureEnv,
}));

import { assertCleanerApiEnabled } from "./cleaner-feature";

describe("assertCleanerApiEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    featureEnv.NEXT_PUBLIC_CLEANER_ENABLED = false;
  });

  it("throws on self-hosted deployments when cleaner is disabled", () => {
    expect(() => assertCleanerApiEnabled()).toThrowError(
      new SafeError("Cleaner is not enabled", 404),
    );
  });

  it("allows self-hosted deployments when cleaner is enabled", () => {
    featureEnv.NEXT_PUBLIC_CLEANER_ENABLED = true;

    expect(() => assertCleanerApiEnabled()).not.toThrow();
  });

  it("allows Vercel deployments without the env gate", () => {
    vi.stubEnv("VERCEL", "1");

    expect(() => assertCleanerApiEnabled()).not.toThrow();
  });
});
