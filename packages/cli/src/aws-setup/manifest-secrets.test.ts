import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { updateServiceManifestSecrets } from "../setup-aws";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

it("adds absent required secrets when updating an existing Copilot manifest", () => {
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readFileSync).mockReturnValue(
    "name: app\nsecrets:\n  # GOOGLE_PUBSUB_VERIFICATION_TOKEN: /placeholder\n  AUTH_SECRET: /old/auth\n  EMAIL_ENCRYPT_SECRET: /old/key\n",
  );
  updateServiceManifestSecrets({ llmEnvVar: "", hasGoogleOAuth: false });
  const content = vi.mocked(writeFileSync).mock.calls[0]?.[1]?.toString();
  expect(content).toMatch(
    /GOOGLE_PUBSUB_VERIFICATION_TOKEN: \/copilot\/\$\{COPILOT_APPLICATION_NAME\}\/\$\{COPILOT_ENVIRONMENT_NAME\}\/secrets\/GOOGLE_PUBSUB_VERIFICATION_TOKEN/,
  );
  expect(
    content?.match(/^ {2}GOOGLE_PUBSUB_VERIFICATION_TOKEN:/gm),
  ).toHaveLength(1);
});
