import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateWebhookUrl,
  validateWebhookUrlFormat,
} from "./webhook-validation";
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

describe("WEBHOOK_ALLOW_PRIVATE_IPS flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe("when enabled", () => {
    beforeEach(() => {
      vi.stubEnv("WEBHOOK_ALLOW_PRIVATE_IPS", "true");
    });

    // NOTE: private-IP *literals* are exercised through validateWebhookUrlFormat
    // (the creation-time entry point used by rule.ts). They are intentionally
    // not tested through validateWebhookUrl: dns.resolve throws ENOTFOUND on any
    // IP literal (public or private), so validateWebhookUrl rejects all bare-IP
    // literals at send time regardless of this flag — a pre-existing quirk that
    // is out of scope here. Hostname targets (incl. Tailscale MagicDNS) work
    // end-to-end and are covered below.
    it("allows private IPv4 literals (validateWebhookUrlFormat)", () => {
      expect(validateWebhookUrlFormat("https://192.168.1.10/hook").valid).toBe(
        true,
      );
      expect(validateWebhookUrlFormat("https://172.16.0.1/hook").valid).toBe(
        true,
      );
    });

    it("allows Tailscale CGNAT (100.64.0.0/10) literals", () => {
      expect(validateWebhookUrlFormat("https://100.64.0.1/hook").valid).toBe(
        true,
      );
      expect(
        validateWebhookUrlFormat("https://100.100.100.100/hook").valid,
      ).toBe(true);
    });

    it("allows loopback IP literals", () => {
      expect(validateWebhookUrlFormat("https://127.0.0.1/hook").valid).toBe(
        true,
      );
    });

    it("allows private IPv6 literals", () => {
      expect(validateWebhookUrlFormat("https://[fd00::1]/hook").valid).toBe(
        true,
      );
    });

    it("allows hostnames that resolve to a private IP", async () => {
      vi.mocked(dns.resolve).mockResolvedValue(["10.1.2.3"]);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error("ENODATA"));

      const result = await validateWebhookUrl(
        "https://host.tailnet.ts.net/webhook",
      );
      expect(result.valid).toBe(true);
    });

    it("allows hostnames that resolve to Tailscale CGNAT", async () => {
      vi.mocked(dns.resolve).mockResolvedValue(["100.96.0.5"]);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error("ENODATA"));

      const result = await validateWebhookUrl(
        "https://nas.tailnet.ts.net/webhook",
      );
      expect(result.valid).toBe(true);
    });

    it("allows hostnames that resolve to a private IPv6", async () => {
      const enodata = new Error("ENODATA") as NodeJS.ErrnoException;
      enodata.code = "ENODATA";
      vi.mocked(dns.resolve).mockRejectedValue(enodata);
      vi.mocked(dns.resolve6).mockResolvedValue(["fd00::1"]);

      const result = await validateWebhookUrl(
        "https://internal-ipv6.example.com/webhook",
      );
      expect(result.valid).toBe(true);
    });

    // The flag relaxes ONLY the private-IP checks. The blocked-hostname and
    // HTTPS-only-in-production constraints remain enforced (defense in depth).
    it("still rejects blocked hostnames (localhost)", async () => {
      const result = await validateWebhookUrl("https://localhost/webhook");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe("Webhook URL hostname is not allowed");
      }
    });

    it("still rejects named cloud metadata hostnames", () => {
      const result = validateWebhookUrlFormat(
        "https://metadata.google.internal/computeMetadata/v1/",
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe("Webhook URL hostname is not allowed");
      }
    });

    it("still rejects HTTP in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      const result = validateWebhookUrlFormat("http://192.168.1.10/webhook");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe("Only HTTPS URLs are allowed for webhooks");
      }
    });
  });

  describe("when unset (default) or disabled", () => {
    it("rejects private IP literals when unset", () => {
      expect(validateWebhookUrlFormat("https://10.0.0.1/hook").valid).toBe(
        false,
      );
    });

    it("rejects private IP literals when explicitly false", () => {
      vi.stubEnv("WEBHOOK_ALLOW_PRIVATE_IPS", "false");
      expect(validateWebhookUrlFormat("https://10.0.0.1/hook").valid).toBe(
        false,
      );
    });

    it("rejects DNS-resolved private IPs when unset", async () => {
      vi.mocked(dns.resolve).mockResolvedValue(["10.0.0.1"]);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error("ENODATA"));

      const result = await validateWebhookUrl("https://internal.example.com/h");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe(
          "Webhook URL cannot resolve to private IP addresses",
        );
      }
    });
  });
});

describe("validateWebhookUrlFormat", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects invalid URLs", () => {
    const result = validateWebhookUrlFormat("not-a-url");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe("Invalid URL format");
  });

  it("rejects file:// scheme", () => {
    const result = validateWebhookUrlFormat("file:///etc/passwd");
    expect(result.valid).toBe(false);
  });

  it("rejects ftp:// scheme", () => {
    const result = validateWebhookUrlFormat("ftp://example.com/file");
    expect(result.valid).toBe(false);
  });

  it("rejects localhost", () => {
    const result = validateWebhookUrlFormat("https://localhost/webhook");
    expect(result.valid).toBe(false);
    if (!result.valid)
      expect(result.error).toBe("Webhook URL hostname is not allowed");
  });

  it("rejects cloud metadata endpoints", () => {
    const result = validateWebhookUrlFormat(
      "https://metadata.google.internal/computeMetadata/v1/",
    );
    expect(result.valid).toBe(false);
    if (!result.valid)
      expect(result.error).toBe("Webhook URL hostname is not allowed");
  });

  it("rejects private IPv4 addresses", () => {
    expect(validateWebhookUrlFormat("https://127.0.0.1/hook").valid).toBe(
      false,
    );
    expect(validateWebhookUrlFormat("https://10.0.0.1/hook").valid).toBe(false);
    expect(validateWebhookUrlFormat("https://192.168.1.1/hook").valid).toBe(
      false,
    );
    expect(validateWebhookUrlFormat("https://169.254.169.254/hook").valid).toBe(
      false,
    );
  });

  it("accepts valid public URLs without DNS resolution", () => {
    const result = validateWebhookUrlFormat("https://example.com/webhook");
    expect(result.valid).toBe(true);
  });

  it("accepts valid URLs with ports", () => {
    const result = validateWebhookUrlFormat("https://example.com:8443/webhook");
    expect(result.valid).toBe(true);
  });

  it("allows HTTP in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const result = validateWebhookUrlFormat("http://example.com/webhook");
    expect(result.valid).toBe(true);
  });

  it("rejects HTTP in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const result = validateWebhookUrlFormat("http://example.com/webhook");
    expect(result.valid).toBe(false);
  });
});
