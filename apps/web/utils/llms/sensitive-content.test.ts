import { describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import {
  enforceSensitiveDataPolicy,
  enforceSensitiveToolOutputPolicy,
} from "@/utils/llms/sensitive-content";

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

  it("redacts sensitive strings inside readEmail tool output", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secret = "d".repeat(24);
    const output = {
      messageId: "message-1",
      threadId: "thread-1",
      from: "sender@example.com",
      to: "user@example.com",
      subject: "Credentials",
      content: `Use api_key=${secret}`,
      attachments: [
        {
          filename: "billing.txt",
          content: "card 4242 4242 4242 4242",
        },
      ],
    };

    const result = enforceSensitiveToolOutputPolicy({
      output,
      policy: "REDACT",
      logger,
      label: "assistant-chat:readEmail",
    });

    expect(result).not.toBe(output);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("4242 4242 4242 4242");
    expect(JSON.stringify(result)).toContain("[REDACTED:CREDENTIAL]");
    expect(JSON.stringify(result)).toContain("[REDACTED:PAYMENT_CARD]");

    warnSpy.mockRestore();
  });

  it("blocks readEmail tool output when configured", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const privateKey = [
      `-----BEGIN ${"PRIVATE"} KEY-----`,
      "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC",
      `-----END ${"PRIVATE"} KEY-----`,
    ].join("\n");

    const result = enforceSensitiveToolOutputPolicy({
      output: {
        messageId: "message-1",
        content: privateKey,
      },
      policy: "BLOCK",
      logger,
      label: "assistant-chat:readEmail",
    });

    expect(result).toMatchObject({
      blocked: true,
      error: expect.stringContaining("tool result was blocked"),
    });
    expect(JSON.stringify(result)).not.toContain("BEGIN PRIVATE KEY");

    warnSpy.mockRestore();
  });

  it("redacts sensitive strings inside readAttachment tool output", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const token = `Bearer ${"e".repeat(24)}`;
    const output = {
      filename: "export.csv",
      mimeType: "text/csv",
      size: 200,
      contentAvailable: true,
      content: `authorization: ${token}`,
      truncated: false,
    };

    const result = enforceSensitiveToolOutputPolicy({
      output,
      policy: "REDACT",
      logger,
      label: "assistant-chat:readAttachment",
    });

    expect(result).not.toBe(output);
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).toContain("[REDACTED:CREDENTIAL]");

    warnSpy.mockRestore();
  });

  it("blocks readAttachment tool output when configured", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secret = "f".repeat(24);

    const result = enforceSensitiveToolOutputPolicy({
      output: {
        filename: "secret.txt",
        contentAvailable: true,
        content: `client_secret=${secret}`,
      },
      policy: "BLOCK",
      logger,
      label: "assistant-chat:readAttachment",
    });

    expect(result).toMatchObject({
      blocked: true,
      error: expect.stringContaining("tool result was blocked"),
    });
    expect(JSON.stringify(result)).not.toContain(secret);

    warnSpy.mockRestore();
  });

  it("redacts sensitive strings inside tool output object keys", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sensitiveKey = `api_key=${"g".repeat(24)}`;

    const result = enforceSensitiveToolOutputPolicy({
      output: {
        [sensitiveKey]: "metadata",
        safe: "value",
      },
      policy: "REDACT",
      logger,
      label: "assistant-chat:testTool",
    });

    expect(JSON.stringify(result)).not.toContain(sensitiveKey);
    expect(Object.keys(result)).toContain("api_key=[REDACTED:CREDENTIAL]");
    expect(result.safe).toBe("value");

    warnSpy.mockRestore();
  });

  it("blocks tool output when only an object key contains sensitive content", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sensitiveKey = `client_secret=${"h".repeat(24)}`;

    const result = enforceSensitiveToolOutputPolicy({
      output: {
        [sensitiveKey]: "metadata",
      },
      policy: "BLOCK",
      logger,
      label: "assistant-chat:testTool",
    });

    expect(result).toMatchObject({
      blocked: true,
      error: expect.stringContaining("tool result was blocked"),
    });
    expect(JSON.stringify(result)).not.toContain(sensitiveKey);

    warnSpy.mockRestore();
  });
});
