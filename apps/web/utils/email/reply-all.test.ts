import { describe, it, expect } from "vitest";
import { buildReplyAllRecipients, formatCcList } from "./reply-all";
import type { ParsedMessageHeaders } from "@/utils/types";

describe("buildReplyAllRecipients", () => {
  it("should handle simple reply-all with TO and CC", () => {
    const headers: ParsedMessageHeaders = {
      from: "sender@example.com",
      to: "user@company.com, colleague@company.com",
      cc: "manager@company.com",
      subject: "Test",
      date: "2024-01-01",
    };

    const result = buildReplyAllRecipients(
      headers,
      undefined,
      "myemail@example.com",
    );

    expect(result.to).toBe("sender@example.com");
    expect(result.cc).toContain("manager@company.com");
    expect(result.cc).toContain("user@company.com");
    expect(result.cc).toContain("colleague@company.com");
    expect(result.cc).toHaveLength(3);
  });

  it("should use reply-to header when available", () => {
    const headers: ParsedMessageHeaders = {
      from: "sender@example.com",
      "reply-to": "noreply@example.com",
      to: "user@company.com",
      subject: "Test",
      date: "2024-01-01",
    };

    const result = buildReplyAllRecipients(
      headers,
      undefined,
      "myemail@example.com",
    );

    expect(result.to).toBe("noreply@example.com");
    expect(result.cc).toContain("user@company.com");
    expect(result.cc).not.toContain("noreply@example.com");
  });

  it("should handle no CC recipients", () => {
    const headers: ParsedMessageHeaders = {
      from: "sender@example.com",
      to: "user@company.com, colleague@company.com",
      subject: "Test",
      date: "2024-01-01",
    };

    const result = buildReplyAllRecipients(
      headers,
      undefined,
      "myemail@example.com",
    );

    expect(result.to).toBe("sender@example.com");
    expect(result.cc).toContain("user@company.com");
    expect(result.cc).toContain("colleague@company.com");
    expect(result.cc).toHaveLength(2);
  });

  it("should handle single recipient (no CC needed)", () => {
    const headers: ParsedMessageHeaders = {
      from: "sender@example.com",
      to: "sender@example.com",
      subject: "Test",
      date: "2024-01-01",
    };

    const result = buildReplyAllRecipients(
      headers,
      undefined,
      "myemail@example.com",
    );

    expect(result.to).toBe("sender@example.com");
    expect(result.cc).toHaveLength(0);
  });

  it("should remove duplicates from CC list", () => {
    const headers: ParsedMessageHeaders = {
      from: "sender@example.com",
      to: "user@company.com, colleague@company.com",
      cc: "colleague@company.com, manager@company.com",
      subject: "Test",
      date: "2024-01-01",
    };

    const result = buildReplyAllRecipients(
      headers,
      undefined,
      "myemail@example.com",
    );

    expect(result.to).toBe("sender@example.com");
    expect(result.cc).toContain("colleague@company.com");
    expect(result.cc).toContain("manager@company.com");
    expect(result.cc).toContain("user@company.com");
    expect(result.cc).toHaveLength(3);
  });

  it("should handle override TO parameter", () => {
    const headers: ParsedMessageHeaders = {
      from: "sender@example.com",
      to: "user@company.com",
      cc: "manager@company.com",
      subject: "Test",
      date: "2024-01-01",
    };

    const result = buildReplyAllRecipients(
      headers,
      "override@example.com",
      "myemail@example.com",
    );

    expect(result.to).toBe("override@example.com");
    expect(result.cc).toContain("user@company.com");
    expect(result.cc).toContain("manager@company.com");
    expect(result.cc).not.toContain("override@example.com");
  });

  it("should handle addresses with extra spaces", () => {
    const headers: ParsedMessageHeaders = {
      from: "sender@example.com",
      to: " user@company.com ,  colleague@company.com ",
      cc: " manager@company.com ",
      subject: "Test",
      date: "2024-01-01",
    };

    const result = buildReplyAllRecipients(
      headers,
      undefined,
      "myemail@example.com",
    );

    expect(result.to).toBe("sender@example.com");
    expect(result.cc).toContain("user@company.com");
    expect(result.cc).toContain("colleague@company.com");
    expect(result.cc).toContain("manager@company.com");
    expect(result.cc).toHaveLength(3);
  });

  it("should filter out empty addresses", () => {
    const headers: ParsedMessageHeaders = {
      from: "sender@example.com",
      to: "user@company.com, , colleague@company.com",
      cc: ", manager@company.com, ",
      subject: "Test",
      date: "2024-01-01",
    };

    const result = buildReplyAllRecipients(
      headers,
      undefined,
      "myemail@example.com",
    );

    expect(result.to).toBe("sender@example.com");
    expect(result.cc).toContain("user@company.com");
    expect(result.cc).toContain("colleague@company.com");
    expect(result.cc).toContain("manager@company.com");
    expect(result.cc).toHaveLength(3);
  });

  it("should exclude the reply-to address from CC", () => {
    const headers: ParsedMessageHeaders = {
      from: "sender@example.com",
      to: "sender@example.com, user@company.com",
      cc: "manager@company.com",
      subject: "Test",
      date: "2024-01-01",
    };

    const result = buildReplyAllRecipients(
      headers,
      undefined,
      "myemail@example.com",
    );

    expect(result.to).toBe("sender@example.com");
    expect(result.cc).not.toContain("sender@example.com");
    expect(result.cc).toContain("user@company.com");
    expect(result.cc).toContain("manager@company.com");
    expect(result.cc).toHaveLength(2);
  });

  it("should handle email addresses with display names", () => {
    const headers: ParsedMessageHeaders = {
      from: '"John Doe" <john@example.com>',
      to: '"Alice Smith" <alice@company.com>, "Bob Jones" <bob@company.com>',
      cc: '"Charlie Brown" <charlie@company.com>',
      subject: "Test",
      date: "2024-01-01",
    };

    const result = buildReplyAllRecipients(
      headers,
      undefined,
      "myemail@example.com",
    );

    expect(result.to).toBe('"John Doe" <john@example.com>');
    expect(result.cc).toContain("alice@company.com");
    expect(result.cc).toContain("bob@company.com");
    expect(result.cc).toContain("charlie@company.com");
    expect(result.cc).toHaveLength(3);
  });

  it("should deduplicate emails with different display names", () => {
    const headers: ParsedMessageHeaders = {
      from: '"John Doe" <john@example.com>',
      to: '"Alice" <alice@company.com>, "Alice Smith" <alice@company.com>',
      cc: 'alice@company.com, "Ms. Alice" <alice@company.com>',
      subject: "Test",
      date: "2024-01-01",
    };

    const result = buildReplyAllRecipients(
      headers,
      undefined,
      "myemail@example.com",
    );

    expect(result.to).toBe('"John Doe" <john@example.com>');
    expect(result.cc).toContain("alice@company.com");
    expect(result.cc).toHaveLength(1); // All duplicates should be removed
  });

  it("should exclude sender with display name from CC", () => {
    const headers: ParsedMessageHeaders = {
      from: '"John Doe" <john@example.com>',
      to: 'john@example.com, "Alice" <alice@company.com>',
      cc: '"John Doe" <john@example.com>, bob@company.com',
      subject: "Test",
      date: "2024-01-01",
    };

    const result = buildReplyAllRecipients(
      headers,
      undefined,
      "myemail@example.com",
    );

    expect(result.to).toBe('"John Doe" <john@example.com>');
    expect(result.cc).not.toContain("john@example.com");
    expect(result.cc).toContain("alice@company.com");
    expect(result.cc).toContain("bob@company.com");
    expect(result.cc).toHaveLength(2);
  });

  it("should handle mixed email formats", () => {
    const headers: ParsedMessageHeaders = {
      from: "sender@example.com",
      to: '"Alice" <alice@company.com>, bob@company.com',
      cc: 'charlie@company.com, "David Lee" <david@company.com>',
      subject: "Test",
      date: "2024-01-01",
    };

    const result = buildReplyAllRecipients(
      headers,
      undefined,
      "myemail@example.com",
    );

    expect(result.to).toBe("sender@example.com");
    expect(result.cc).toContain("alice@company.com");
    expect(result.cc).toContain("bob@company.com");
    expect(result.cc).toContain("charlie@company.com");
    expect(result.cc).toContain("david@company.com");
    expect(result.cc).toHaveLength(4);
  });

  it("should handle override TO with display name format", () => {
    const headers: ParsedMessageHeaders = {
      from: "sender@example.com",
      to: "user@company.com",
      cc: "manager@company.com",
      subject: "Test",
      date: "2024-01-01",
    };

    const result = buildReplyAllRecipients(
      headers,
      '"Override User" <override@example.com>',
      "myemail@example.com",
    );

    expect(result.to).toBe('"Override User" <override@example.com>');
    expect(result.cc).toContain("user@company.com");
    expect(result.cc).toContain("manager@company.com");
    expect(result.cc).not.toContain("override@example.com");
    expect(result.cc).toHaveLength(2);
  });

  it("should handle malformed email addresses gracefully", () => {
    const headers: ParsedMessageHeaders = {
      from: "sender@example.com",
      to: '"Invalid" <<double@brackets>>, valid@company.com',
      cc: "not-an-email, real@company.com",
      subject: "Test",
      date: "2024-01-01",
    };

    const result = buildReplyAllRecipients(
      headers,
      undefined,
      "myemail@example.com",
    );

    expect(result.to).toBe("sender@example.com");
    expect(result.cc).toContain("valid@company.com");
    expect(result.cc).toContain("real@company.com");
    expect(result.cc).not.toContain(""); // Empty strings should be filtered out
    expect(result.cc).toHaveLength(2);
  });

  it("should exclude current user from CC", () => {
    const headers: ParsedMessageHeaders = {
      from: "sender@example.com",
      to: "me@mycompany.com, colleague@company.com",
      cc: "manager@company.com",
      subject: "Test",
      date: "2024-01-01",
    };

    const result = buildReplyAllRecipients(
      headers,
      undefined,
      "me@mycompany.com",
    );

    expect(result.to).toBe("sender@example.com");
    expect(result.cc).not.toContain("me@mycompany.com");
    expect(result.cc).toContain("colleague@company.com");
    expect(result.cc).toContain("manager@company.com");
    expect(result.cc).toHaveLength(2);
  });

  it("should exclude current user with display name from CC", () => {
    const headers: ParsedMessageHeaders = {
      from: '"Alice" <alice@example.com>',
      to: '"Me" <me@mycompany.com>, "Bob" <bob@company.com>',
      cc: 'me@mycompany.com, "Charlie" <charlie@company.com>',
      subject: "Test",
      date: "2024-01-01",
    };

    const result = buildReplyAllRecipients(
      headers,
      undefined,
      '"My Name" <me@mycompany.com>',
    );

    expect(result.to).toBe('"Alice" <alice@example.com>');
    expect(result.cc).not.toContain("me@mycompany.com");
    expect(result.cc).toContain("bob@company.com");
    expect(result.cc).toContain("charlie@company.com");
    expect(result.cc).toHaveLength(2);
  });
});

describe("formatCcList", () => {
  it("should format array of addresses as comma-separated string", () => {
    const addresses = ["user1@example.com", "user2@example.com"];
    const result = formatCcList(addresses);
    expect(result).toBe("user1@example.com, user2@example.com");
  });

  it("should return undefined for empty array", () => {
    const result = formatCcList([]);
    expect(result).toBeUndefined();
  });

  it("should handle single address", () => {
    const result = formatCcList(["user@example.com"]);
    expect(result).toBe("user@example.com");
  });
});
