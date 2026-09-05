import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { updateServiceManifestSecrets } from "../setup-aws";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

it("passes both Bedrock runtime keys to ECS through SSM references", () => {
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readFileSync).mockReturnValue(
    "name: app\nsecrets:\n  # BEDROCK_ACCESS_KEY: /placeholder\n  # BEDROCK_SECRET_KEY: /placeholder\n  BEDROCK_REGION: /region\n",
  );
  updateServiceManifestSecrets({
    llmEnvVar: "BEDROCK_REGION",
    hasGoogleOAuth: false,
  });
  const content = vi.mocked(writeFileSync).mock.calls[0]?.[1]?.toString();
  expect(content).toMatch(
    /BEDROCK_ACCESS_KEY: \/copilot\/.*\/secrets\/BEDROCK_ACCESS_KEY/,
  );
  expect(content).toMatch(
    /BEDROCK_SECRET_KEY: \/copilot\/.*\/secrets\/BEDROCK_SECRET_KEY/,
  );
});
