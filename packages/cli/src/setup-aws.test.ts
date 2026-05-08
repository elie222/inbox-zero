import { spawnSync } from "node:child_process";
import * as p from "@clack/prompts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAwsSetup, validateEnvironmentName } from "./setup-aws";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  log: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  },
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

describe("validateEnvironmentName", () => {
  it("accepts Copilot environment names used by the interactive prompt", () => {
    expect(validateEnvironmentName("production")).toBeUndefined();
    expect(validateEnvironmentName("staging-2")).toBeUndefined();
  });

  it("rejects unsafe or invalid environment names", () => {
    expect(validateEnvironmentName("../production")).toBe(
      "Must start with a letter and contain only lowercase letters, numbers, and hyphens",
    );
    expect(validateEnvironmentName("Production")).toBe(
      "Must start with a letter and contain only lowercase letters, numbers, and hyphens",
    );
    expect(validateEnvironmentName("")).toBe("Environment name is required");
  });
});

describe("runAwsSetup", () => {
  beforeEach(() => {
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit:${code}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects invalid --environment values before shelling out", async () => {
    await expect(runAwsSetup({ environment: "../production" })).rejects.toThrow(
      "process.exit:1",
    );

    expect(p.log.error).toHaveBeenCalledWith(
      "Invalid environment name: Must start with a letter and contain only lowercase letters, numbers, and hyphens",
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });
});
