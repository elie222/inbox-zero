import { describe, it, expect, vi, beforeEach } from "vitest";
import { hasPreviousCommunicationsWithSenderOrDomain } from "./message";
import type { EmailProvider } from "@/utils/email/types";

vi.mock("server-only", () => ({}));

describe("hasPreviousCommunicationsWithSenderOrDomain - label exclusion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should add label exclusion to Gmail search queries", async () => {
    const mockGetMessagesWithPagination = vi.fn().mockResolvedValue({
      messages: [],
    });

    const mockProvider: EmailProvider = {
      getMessagesWithPagination: mockGetMessagesWithPagination,
    } as never;

    const testDate = new Date("2024-01-15T12:00:00Z");

    // For company domains (non-public), searches by domain
    await hasPreviousCommunicationsWithSenderOrDomain(mockProvider, {
      from: "sender@example.com",
      date: testDate,
      messageId: "msg-123",
      excludeLabel: "Cold Email",
      excludeFolder: null,
    });

    // Verify that both incoming and outgoing searches include label exclusion
    expect(mockGetMessagesWithPagination).toHaveBeenCalledTimes(2);

    // Check incoming email search (from:) - searches by domain for company emails
    expect(mockGetMessagesWithPagination).toHaveBeenCalledWith({
      query: 'from:example.com -label:"Cold Email"',
      maxResults: 2,
      before: testDate,
    });

    // Check outgoing email search (to:) - searches by domain for company emails
    expect(mockGetMessagesWithPagination).toHaveBeenCalledWith({
      query: 'to:example.com -label:"Cold Email"',
      maxResults: 2,
      before: testDate,
    });
  });

  it("should not add label exclusion when excludeLabel is null", async () => {
    const mockGetMessagesWithPagination = vi.fn().mockResolvedValue({
      messages: [],
    });

    const mockProvider: EmailProvider = {
      getMessagesWithPagination: mockGetMessagesWithPagination,
    } as never;

    const testDate = new Date("2024-01-15T12:00:00Z");

    await hasPreviousCommunicationsWithSenderOrDomain(mockProvider, {
      from: "sender@example.com",
      date: testDate,
      messageId: "msg-123",
      excludeLabel: null,
      excludeFolder: null,
    });

    // Verify that queries don't include label exclusion
    // For company domains (non-public), searches by domain
    expect(mockGetMessagesWithPagination).toHaveBeenCalledWith({
      query: "from:example.com",
      maxResults: 2,
      before: testDate,
    });

    expect(mockGetMessagesWithPagination).toHaveBeenCalledWith({
      query: "to:example.com",
      maxResults: 2,
      before: testDate,
    });
  });

  it("should search by domain for non-public domains with label exclusion", async () => {
    const mockGetMessagesWithPagination = vi.fn().mockResolvedValue({
      messages: [],
    });

    const mockProvider: EmailProvider = {
      getMessagesWithPagination: mockGetMessagesWithPagination,
    } as never;

    const testDate = new Date("2024-01-15T12:00:00Z");

    // Use a company domain (not a public one like gmail.com)
    await hasPreviousCommunicationsWithSenderOrDomain(mockProvider, {
      from: "person@company.com",
      date: testDate,
      messageId: "msg-123",
      excludeLabel: "Cold Email",
      excludeFolder: null,
    });

    // For company domains, should search by domain, not full email
    expect(mockGetMessagesWithPagination).toHaveBeenCalledWith({
      query: 'from:company.com -label:"Cold Email"',
      maxResults: 2,
      before: testDate,
    });

    expect(mockGetMessagesWithPagination).toHaveBeenCalledWith({
      query: 'to:company.com -label:"Cold Email"',
      maxResults: 2,
      before: testDate,
    });
  });

  it("should search by full email for public domains like gmail.com", async () => {
    const mockGetMessagesWithPagination = vi.fn().mockResolvedValue({
      messages: [],
    });

    const mockProvider: EmailProvider = {
      getMessagesWithPagination: mockGetMessagesWithPagination,
    } as never;

    const testDate = new Date("2024-01-15T12:00:00Z");

    await hasPreviousCommunicationsWithSenderOrDomain(mockProvider, {
      from: "person@gmail.com",
      date: testDate,
      messageId: "msg-123",
      excludeLabel: "Cold Email",
      excludeFolder: null,
    });

    // For public domains like gmail.com, should search by full email
    expect(mockGetMessagesWithPagination).toHaveBeenCalledWith({
      query: 'from:person@gmail.com -label:"Cold Email"',
      maxResults: 2,
      before: testDate,
    });

    expect(mockGetMessagesWithPagination).toHaveBeenCalledWith({
      query: 'to:person@gmail.com -label:"Cold Email"',
      maxResults: 2,
      before: testDate,
    });
  });

  it("should handle custom label names correctly", async () => {
    const mockGetMessagesWithPagination = vi.fn().mockResolvedValue({
      messages: [],
    });

    const mockProvider: EmailProvider = {
      getMessagesWithPagination: mockGetMessagesWithPagination,
    } as never;

    const testDate = new Date("2024-01-15T12:00:00Z");

    await hasPreviousCommunicationsWithSenderOrDomain(mockProvider, {
      from: "sender@example.com",
      date: testDate,
      messageId: "msg-123",
      excludeLabel: "My Custom Cold Email Label",
      excludeFolder: null,
    });

    // Verify custom label name is used
    // For company domains (non-public), searches by domain
    expect(mockGetMessagesWithPagination).toHaveBeenCalledWith({
      query: 'from:example.com -label:"My Custom Cold Email Label"',
      maxResults: 2,
      before: testDate,
    });

    expect(mockGetMessagesWithPagination).toHaveBeenCalledWith({
      query: 'to:example.com -label:"My Custom Cold Email Label"',
      maxResults: 2,
      before: testDate,
    });
  });

  it("should return false when no previous emails exist (excluding cold emails)", async () => {
    const mockGetMessagesWithPagination = vi.fn().mockResolvedValue({
      messages: [],
    });

    const mockProvider: EmailProvider = {
      getMessagesWithPagination: mockGetMessagesWithPagination,
    } as never;

    const result = await hasPreviousCommunicationsWithSenderOrDomain(
      mockProvider,
      {
        from: "sender@example.com",
        date: new Date(),
        messageId: "msg-123",
        excludeLabel: "Cold Email",
        excludeFolder: null,
      },
    );

    expect(result).toBe(false);
  });

  it("should return true when previous emails exist (excluding cold emails)", async () => {
    const mockGetMessagesWithPagination = vi.fn().mockResolvedValue({
      messages: [
        {
          id: "prev-msg-1",
          threadId: "thread-1",
          from: "sender@example.com",
          date: new Date("2024-01-10"),
        },
      ],
    });

    const mockProvider: EmailProvider = {
      getMessagesWithPagination: mockGetMessagesWithPagination,
    } as never;

    const result = await hasPreviousCommunicationsWithSenderOrDomain(
      mockProvider,
      {
        from: "sender@example.com",
        date: new Date("2024-01-15"),
        messageId: "msg-123",
        excludeLabel: "Cold Email",
        excludeFolder: null,
      },
    );

    expect(result).toBe(true);
  });

  it("should exclude the current message from results", async () => {
    const mockGetMessagesWithPagination = vi.fn().mockResolvedValue({
      messages: [
        {
          id: "msg-123", // Same as current message
          threadId: "thread-1",
        },
      ],
    });

    const mockProvider: EmailProvider = {
      getMessagesWithPagination: mockGetMessagesWithPagination,
    } as never;

    const result = await hasPreviousCommunicationsWithSenderOrDomain(
      mockProvider,
      {
        from: "sender@example.com",
        date: new Date(),
        messageId: "msg-123",
        excludeLabel: "Cold Email",
        excludeFolder: null,
      },
    );

    // Should return false because the only message found is the current one
    expect(result).toBe(false);
  });
});
