import { describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import { enforceSensitiveDataPolicy } from "@/utils/llms/sensitive-content";

const logger = createScopedLogger("llms-sensitive-content-test");

describe("Sensitive data policy enforcement", () => {
  it("leaves allow-mode requests unchanged", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secret = "a".repeat(24);
    const options = {
      prompt: `api_key=${secret}`,
    };

    expect(
      enforceSensitiveDataPolicy({
        options,
        policy: "ALLOW",
        logger,
        label: "test",
      }),
    ).toBe(options);

    warnSpy.mockRestore();
  });

  it("redacts sensitive strings inside messages", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secret = "b".repeat(24);
    const options = {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `token=${secret}`,
            },
          ],
        },
      ],
    };

    const result = enforceSensitiveDataPolicy({
      options,
      policy: "REDACT",
      logger,
      label: "test",
    });

    expect(result).not.toBe(options);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).toContain("[REDACTED:CREDENTIAL]");

    warnSpy.mockRestore();
  });

  it("blocks requests before provider calls when configured", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secret = "c".repeat(24);

    expect(() =>
      enforceSensitiveDataPolicy({
        options: {
          prompt: `client_secret=${secret}`,
        },
        policy: "BLOCK",
        logger,
        label: "test",
      }),
    ).toThrow("blocked by your account settings");

    warnSpy.mockRestore();
  });
});
