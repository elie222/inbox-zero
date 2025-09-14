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

    const result = buildReplyAllRecipients(headers);

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

    const result = buildReplyAllRecipients(headers);

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

    const result = buildReplyAllRecipients(headers);

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

    const result = buildReplyAllRecipients(headers);

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

    const result = buildReplyAllRecipients(headers);

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

    const result = buildReplyAllRecipients(headers, "override@example.com");

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

    const result = buildReplyAllRecipients(headers);

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

    const result = buildReplyAllRecipients(headers);

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

    const result = buildReplyAllRecipients(headers);

    expect(result.to).toBe("sender@example.com");
    expect(result.cc).not.toContain("sender@example.com");
    expect(result.cc).toContain("user@company.com");
    expect(result.cc).toContain("manager@company.com");
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
