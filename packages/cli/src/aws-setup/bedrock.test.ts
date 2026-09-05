import { afterEach, expect, it, vi } from "vitest";
import { getBedrockCredentials } from "./bedrock";

afterEach(() => vi.unstubAllEnvs());

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
