import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateWebhookUrl } from "./webhook-validation";
import * as dns from "node:dns/promises";

// Mock dns.resolve and dns.resolve6
vi.mock("node:dns/promises", () => ({
  resolve: vi.fn(),
  resolve6: vi.fn(),
}));

describe("validateWebhookUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe("URL format validation", () => {
    it("rejects invalid URLs", async () => {
      const result = await validateWebhookUrl("not-a-url");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe("Invalid URL format");
      }
    });

    it("rejects URLs without protocol", async () => {
      const result = await validateWebhookUrl("example.com/webhook");
      expect(result.valid).toBe(false);
    });
  });

  describe("protocol validation", () => {
    describe("in production", () => {
      beforeEach(() => {
        vi.stubEnv("NODE_ENV", "production");
      });

      it("rejects HTTP URLs in production", async () => {
        const result = await validateWebhookUrl("http://example.com/webhook");
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toBe("Only HTTPS URLs are allowed for webhooks");
        }
      });

      it("rejects FTP URLs", async () => {
        const result = await validateWebhookUrl("ftp://example.com/file");
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toBe("Only HTTPS URLs are allowed for webhooks");
        }
      });

      it("rejects file URLs", async () => {
        const result = await validateWebhookUrl("file:///etc/passwd");
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toBe("Only HTTPS URLs are allowed for webhooks");
        }
      });
    });

    describe("in development", () => {
      beforeEach(() => {
        vi.stubEnv("NODE_ENV", "development");
      });

      it("allows HTTP URLs in development", async () => {
        vi.mocked(dns.resolve).mockResolvedValue(["93.184.216.34"]);
        vi.mocked(dns.resolve6).mockRejectedValue(new Error("ENODATA"));

        const result = await validateWebhookUrl("http://example.com/webhook");
        expect(result.valid).toBe(true);
      });

      it("still rejects FTP URLs in development", async () => {
        const result = await validateWebhookUrl("ftp://example.com/file");
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toBe(
            "Only HTTP and HTTPS URLs are allowed for webhooks",
          );
        }
      });
    });
  });

  describe("blocked hostnames", () => {
    it("rejects localhost", async () => {
      const result = await validateWebhookUrl("https://localhost/webhook");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe("Webhook URL hostname is not allowed");
      }
    });

    it("rejects localhost.localdomain", async () => {
      const result = await validateWebhookUrl(
        "https://localhost.localdomain/webhook",
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe("Webhook URL hostname is not allowed");
      }
    });

    it("rejects cloud metadata endpoints", async () => {
      const result = await validateWebhookUrl(
        "https://metadata.google.internal/computeMetadata/v1/",
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe("Webhook URL hostname is not allowed");
      }
    });
  });

  describe("private IP address validation", () => {
    it("rejects 127.0.0.1 (loopback)", async () => {
      const result = await validateWebhookUrl("https://127.0.0.1/webhook");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe(
          "Webhook URL cannot point to private IP addresses",
        );
      }
    });

    it("rejects 10.x.x.x (private)", async () => {
      const result = await validateWebhookUrl("https://10.0.0.1/webhook");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe(
          "Webhook URL cannot point to private IP addresses",
        );
      }
    });

    it("rejects 172.16.x.x (private)", async () => {
      const result = await validateWebhookUrl("https://172.16.0.1/webhook");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe(
          "Webhook URL cannot point to private IP addresses",
        );
      }
    });

    it("rejects 192.168.x.x (private)", async () => {
      const result = await validateWebhookUrl("https://192.168.1.1/webhook");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe(
          "Webhook URL cannot point to private IP addresses",
        );
      }
    });

    it("rejects 169.254.169.254 (cloud metadata)", async () => {
      const result = await validateWebhookUrl(
        "https://169.254.169.254/latest/meta-data/",
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe(
          "Webhook URL cannot point to private IP addresses",
        );
      }
    });
  });

  describe("DNS resolution validation", () => {
    it("rejects URLs that resolve to private IPs (DNS rebinding protection)", async () => {
      vi.mocked(dns.resolve).mockResolvedValue(["10.0.0.1"]);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error("ENODATA"));

      const result = await validateWebhookUrl(
        "https://evil-rebind.example.com/webhook",
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe(
          "Webhook URL cannot resolve to private IP addresses",
        );
      }
    });

    it("rejects URLs that resolve to localhost", async () => {
      vi.mocked(dns.resolve).mockResolvedValue(["127.0.0.1"]);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error("ENODATA"));

      const result = await validateWebhookUrl(
        "https://my-local-alias.com/webhook",
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe(
          "Webhook URL cannot resolve to private IP addresses",
        );
      }
    });

    it("rejects URLs that resolve to cloud metadata IP", async () => {
      vi.mocked(dns.resolve).mockResolvedValue(["169.254.169.254"]);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error("ENODATA"));

      const result = await validateWebhookUrl(
        "https://sneaky-metadata.com/webhook",
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe(
          "Webhook URL cannot resolve to private IP addresses",
        );
      }
    });

    it("rejects URLs that resolve to private IPv6 (AAAA-only bypass protection)", async () => {
      const enodata = new Error("ENODATA") as NodeJS.ErrnoException;
      enodata.code = "ENODATA";
      vi.mocked(dns.resolve).mockRejectedValue(enodata);
      vi.mocked(dns.resolve6).mockResolvedValue(["::1"]);

      const result = await validateWebhookUrl(
        "https://ipv6-only-internal.example.com/webhook",
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe(
          "Webhook URL cannot resolve to private IP addresses",
        );
      }
    });

    it("rejects URLs that resolve to link-local IPv6", async () => {
      const enodata = new Error("ENODATA") as NodeJS.ErrnoException;
      enodata.code = "ENODATA";
      vi.mocked(dns.resolve).mockRejectedValue(enodata);
      vi.mocked(dns.resolve6).mockResolvedValue(["fe80::1"]);

      const result = await validateWebhookUrl(
        "https://link-local-ipv6.example.com/webhook",
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe(
          "Webhook URL cannot resolve to private IP addresses",
        );
      }
    });

    it("rejects URLs with unresolvable hostnames", async () => {
      const error = new Error("ENOTFOUND") as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      vi.mocked(dns.resolve).mockRejectedValue(error);

      const result = await validateWebhookUrl(
        "https://nonexistent-domain-12345.com/webhook",
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe("Webhook URL hostname could not be resolved");
      }
    });
  });

  describe("valid URLs", () => {
    it("accepts valid HTTPS URLs that resolve to public IPs", async () => {
      vi.mocked(dns.resolve).mockResolvedValue(["93.184.216.34"]);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error("ENODATA"));

      const result = await validateWebhookUrl("https://example.com/webhook");
      expect(result.valid).toBe(true);
    });

    it("accepts valid HTTPS URLs with ports", async () => {
      vi.mocked(dns.resolve).mockResolvedValue(["93.184.216.34"]);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error("ENODATA"));

      const result = await validateWebhookUrl(
        "https://example.com:8443/webhook",
      );
      expect(result.valid).toBe(true);
    });

    it("accepts valid HTTPS URLs with paths and query params", async () => {
      vi.mocked(dns.resolve).mockResolvedValue(["93.184.216.34"]);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error("ENODATA"));

      const result = await validateWebhookUrl(
        "https://api.example.com/v1/webhook?token=abc123",
      );
      expect(result.valid).toBe(true);
    });

    it("accepts valid dual-stack URLs with public IPs", async () => {
      vi.mocked(dns.resolve).mockResolvedValue(["93.184.216.34"]);
      vi.mocked(dns.resolve6).mockResolvedValue([
        "2606:2800:220:1:248:1893:25c8:1946",
      ]);

      const result = await validateWebhookUrl("https://example.com/webhook");
      expect(result.valid).toBe(true);
    });
  });
});
