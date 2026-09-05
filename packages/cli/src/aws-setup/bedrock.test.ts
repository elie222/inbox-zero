import * as p from "@clack/prompts";
import { afterEach, expect, it, vi } from "vitest";
import { getBedrockCredentials } from "./bedrock";

vi.mock("@clack/prompts", () => ({
  log: { info: vi.fn() },
  group: vi.fn(),
  cancel: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("rejects unattended setup without runtime Bedrock credentials", async () => {
  vi.stubEnv("BEDROCK_ACCESS_KEY", "");
  vi.stubEnv("BEDROCK_SECRET_KEY", "");
  await expect(getBedrockCredentials(true)).rejects.toThrow(
    /BEDROCK_ACCESS_KEY.*BEDROCK_SECRET_KEY/,
  );
});

it("uses explicit runtime keys independently of the deployment AWS profile", async () => {
  vi.stubEnv("BEDROCK_ACCESS_KEY", "runtime-access-key");
  vi.stubEnv("BEDROCK_SECRET_KEY", "runtime-secret-key");
  await expect(getBedrockCredentials(true)).resolves.toEqual({
    BEDROCK_ACCESS_KEY: "runtime-access-key",
    BEDROCK_SECRET_KEY: "runtime-secret-key",
  });
});

it.each([
  ["present", ""],
  ["", "present"],
])("rejects partial unattended credentials (%s, %s)", async (accessKey, secretKey) => {
  vi.stubEnv("BEDROCK_ACCESS_KEY", accessKey);
  vi.stubEnv("BEDROCK_SECRET_KEY", secretKey);
  await expect(getBedrockCredentials(true)).rejects.toThrow(
    /BEDROCK_ACCESS_KEY.*BEDROCK_SECRET_KEY/,
  );
  expect(p.group).not.toHaveBeenCalled();
});

it("collects runtime credentials interactively", async () => {
  vi.stubEnv("BEDROCK_ACCESS_KEY", "");
  vi.stubEnv("BEDROCK_SECRET_KEY", "");
  vi.mocked(p.group).mockResolvedValue({
    accessKey: "interactive-access",
    secretKey: "interactive-secret",
  });
  await expect(getBedrockCredentials(false)).resolves.toEqual({
    BEDROCK_ACCESS_KEY: "interactive-access",
    BEDROCK_SECRET_KEY: "interactive-secret",
  });
});

it("cancels interactive setup without reporting a failure", async () => {
  vi.stubEnv("BEDROCK_ACCESS_KEY", "");
  vi.stubEnv("BEDROCK_SECRET_KEY", "");
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`process.exit:${code}`);
  });
  vi.mocked(p.group).mockImplementation(async (_prompts, options) => {
    options?.onCancel?.({ results: {} });
    return {};
  });
  await expect(getBedrockCredentials(false)).rejects.toThrow("process.exit:0");
  expect(p.cancel).toHaveBeenCalledWith("Setup cancelled.");
});
