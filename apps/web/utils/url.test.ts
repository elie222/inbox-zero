import { describe, it, expect } from "vitest";
import {
  getEmailUrl,
  getEmailUrlForMessage,
  getGmailUrl,
  getGmailSearchUrl,
  getGmailBasicSearchUrl,
  getGmailFilterSettingsUrl,
} from "./url";

describe("getEmailUrl", () => {
  describe("Google provider", () => {
    it("builds Gmail URL with email address", () => {
      const result = getEmailUrl("msg123", "user@gmail.com", "google");
      expect(result).toBe(
        "https://mail.google.com/mail/u/user@gmail.com/#all/msg123",
      );
    });

    it("builds Gmail URL without email address", () => {
      const result = getEmailUrl("msg123", null, "google");
      expect(result).toBe("https://mail.google.com/mail/u/0/#all/msg123");
    });

    it("builds Gmail URL with undefined email address", () => {
      const result = getEmailUrl("msg123", undefined, "google");
      expect(result).toBe("https://mail.google.com/mail/u/0/#all/msg123");
    });
  });

  describe("Microsoft provider", () => {
    it("builds Outlook URL with encoded message ID", () => {
      const result = getEmailUrl("msg123", "user@outlook.com", "microsoft");
      expect(result).toBe("https://outlook.live.com/mail/0/inbox/id/msg123");
    });

    it("encodes special characters in message ID", () => {
      const result = getEmailUrl("msg+123/abc", null, "microsoft");
      expect(result).toBe(
        "https://outlook.live.com/mail/0/inbox/id/msg%2B123%2Fabc",
      );
    });

    it("encodes message ID with spaces and special chars", () => {
      const result = getEmailUrl("msg id=abc", null, "microsoft");
      expect(result).toBe(
        "https://outlook.live.com/mail/0/inbox/id/msg%20id%3Dabc",
      );
    });
  });

  describe("Default provider", () => {
    it("uses Gmail format when provider is undefined", () => {
      const result = getEmailUrl("msg123", "user@gmail.com");
      expect(result).toBe(
        "https://mail.google.com/mail/u/user@gmail.com/#all/msg123",
      );
    });

    it("throws for unknown provider (bug: should fall back to default)", () => {
      // NOTE: This documents a potential bug - unknown providers cause an error
      // instead of falling back to the "default" config.
      // The getProviderConfig function only falls back when provider is undefined,
      // not when the provider key doesn't exist in PROVIDER_CONFIG.
      expect(() =>
        getEmailUrl("msg123", "user@gmail.com", "unknown"),
      ).toThrow();
    });
  });
});

describe("getEmailUrlForMessage", () => {
  describe("Google provider", () => {
    it("uses messageId for Google", () => {
      const result = getEmailUrlForMessage(
        "messageId123",
        "threadId456",
        "user@gmail.com",
        "google",
      );
      expect(result).toContain("messageId123");
      expect(result).not.toContain("threadId456");
    });
  });

  describe("Microsoft provider", () => {
    it("uses threadId for Microsoft", () => {
      const result = getEmailUrlForMessage(
        "messageId123",
        "threadId456",
        "user@outlook.com",
        "microsoft",
      );
      expect(result).toContain("threadId456");
      expect(result).not.toContain("messageId123");
    });
  });

  describe("Default provider", () => {
    it("uses threadId for default/unknown provider", () => {
      const result = getEmailUrlForMessage(
        "messageId123",
        "threadId456",
        "user@example.com",
      );
      expect(result).toContain("threadId456");
    });
  });
});

describe("getGmailUrl", () => {
  it("is an alias for getEmailUrl with google provider", () => {
    const result = getGmailUrl("msg123", "user@gmail.com");
    const expected = getEmailUrl("msg123", "user@gmail.com", "google");
    expect(result).toBe(expected);
  });

  it("works without email address", () => {
    const result = getGmailUrl("msg123");
    expect(result).toBe("https://mail.google.com/mail/u/0/#all/msg123");
  });
});

describe("getGmailSearchUrl", () => {
  it("builds advanced search URL with from parameter", () => {
    const result = getGmailSearchUrl("sender@example.com", "user@gmail.com");
    expect(result).toBe(
      "https://mail.google.com/mail/u/user@gmail.com/#advanced-search/from=sender%40example.com",
    );
  });

  it("encodes special characters in from", () => {
    const result = getGmailSearchUrl("test+user@example.com", null);
    expect(result).toContain("from=test%2Buser%40example.com");
  });

  it("handles from with display name", () => {
    const result = getGmailSearchUrl(
      "John Doe <john@example.com>",
      "user@gmail.com",
    );
    expect(result).toContain("from=John%20Doe%20%3Cjohn%40example.com%3E");
  });
});

describe("getGmailBasicSearchUrl", () => {
  it("builds search URL with query", () => {
    const result = getGmailBasicSearchUrl("user@gmail.com", "is:unread");
    expect(result).toBe(
      "https://mail.google.com/mail/u/user@gmail.com/#search/is%3Aunread",
    );
  });

  it("encodes complex queries", () => {
    const result = getGmailBasicSearchUrl(
      "user@gmail.com",
      "from:sender@test.com subject:hello",
    );
    expect(result).toContain("#search/");
    expect(result).toContain("from%3Asender%40test.com");
    expect(result).toContain("subject%3Ahello");
  });

  it("handles queries with special characters", () => {
    const result = getGmailBasicSearchUrl(
      "user@gmail.com",
      "label:inbox/important",
    );
    expect(result).toContain("label%3Ainbox%2Fimportant");
  });
});

describe("getGmailFilterSettingsUrl", () => {
  it("builds filter settings URL with email address", () => {
    const result = getGmailFilterSettingsUrl("user@gmail.com");
    expect(result).toBe(
      "https://mail.google.com/mail/u/user@gmail.com/#settings/filters",
    );
  });

  it("builds filter settings URL without email address", () => {
    const result = getGmailFilterSettingsUrl();
    expect(result).toBe("https://mail.google.com/mail/u/0/#settings/filters");
  });

  it("builds filter settings URL with null email", () => {
    const result = getGmailFilterSettingsUrl(null);
    expect(result).toBe("https://mail.google.com/mail/u/0/#settings/filters");
  });
});
