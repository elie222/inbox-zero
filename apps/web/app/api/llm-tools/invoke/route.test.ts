// Mock server-only as per testing guidelines
vi.mock("server-only", () => ({}));

// Mock Prisma
vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    rule: {
      findUnique: vi.fn(),
    },
    knowledge: {
      create: vi.fn(),
    },
  },
}));

// Mock env
vi.mock("@/env", () => ({
  env: {
    LLM_TOOL_PROXY_TOKEN: "test-token-12345",
  },
}));

// Mock logger
vi.mock("@/utils/logger", () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Mock rule utilities
vi.mock("@/utils/rule/rule", () => ({
  createRule: vi.fn(),
  partialUpdateRule: vi.fn(),
  updateRuleActions: vi.fn(),
}));

// Mock learned patterns
vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPatterns: vi.fn(),
}));

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import prisma from "@/utils/prisma";
import { POST } from "./route";

describe("LLM Tools Invoke Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper to create mock NextRequest
  const createMockRequest = (options: {
    body?: unknown;
    authHeader?: string;
  }) => {
    const headers = new Headers();
    if (options.authHeader) {
      headers.set("Authorization", options.authHeader);
    }
    headers.set("Content-Type", "application/json");

    return new NextRequest("http://localhost/api/llm-tools/invoke", {
      method: "POST",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  };

  describe("Authorization", () => {
    test("should return 401 when Authorization header is missing", async () => {
      const request = createMockRequest({
        body: {
          tool: "getUserRulesAndSettings",
          input: {},
          userEmail: "test@example.com",
        },
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.code).toBe("UNAUTHORIZED");
      expect(body.error).toContain("Missing or invalid Authorization header");
    });

    test("should return 401 when Authorization header format is wrong", async () => {
      const request = createMockRequest({
        body: {
          tool: "getUserRulesAndSettings",
          input: {},
          userEmail: "test@example.com",
        },
        authHeader: "Basic invalid-format",
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.code).toBe("UNAUTHORIZED");
    });

    test("should return 401 when token is invalid", async () => {
      const request = createMockRequest({
        body: {
          tool: "getUserRulesAndSettings",
          input: {},
          userEmail: "test@example.com",
        },
        authHeader: "Bearer wrong-token",
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.code).toBe("UNAUTHORIZED");
      expect(body.error).toContain("Invalid authorization token");
    });

    test("should accept valid token", async () => {
      // Mock email account lookup
      vi.mocked(prisma.emailAccount.findUnique).mockResolvedValueOnce({
        id: "account-123",
        email: "test@example.com",
        about: "Test user",
        account: { provider: "google" },
        rules: [],
      } as any);

      const request = createMockRequest({
        body: {
          tool: "getUserRulesAndSettings",
          input: {},
          userEmail: "test@example.com",
        },
        authHeader: "Bearer test-token-12345",
      });

      const response = await POST(request);

      // Should not get 401
      expect(response.status).not.toBe(401);
    });
  });

  describe("Request Validation", () => {
    test("should return 400 for invalid JSON body", async () => {
      const headers = new Headers();
      headers.set("Authorization", "Bearer test-token-12345");
      headers.set("Content-Type", "application/json");

      const request = new NextRequest("http://localhost/api/llm-tools/invoke", {
        method: "POST",
        headers,
        body: "invalid json {",
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.error).toContain("Invalid JSON body");
    });

    test("should return 400 when tool name is missing", async () => {
      const request = createMockRequest({
        body: { input: {}, userEmail: "test@example.com" },
        authHeader: "Bearer test-token-12345",
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    test("should return 400 when userEmail is missing", async () => {
      const request = createMockRequest({
        body: { tool: "getUserRulesAndSettings", input: {} },
        authHeader: "Bearer test-token-12345",
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    test("should return 400 when userEmail is invalid format", async () => {
      const request = createMockRequest({
        body: {
          tool: "getUserRulesAndSettings",
          input: {},
          userEmail: "not-an-email",
        },
        authHeader: "Bearer test-token-12345",
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    test("should return 400 when tool name is invalid", async () => {
      const request = createMockRequest({
        body: {
          tool: "invalidToolName",
          input: {},
          userEmail: "test@example.com",
        },
        authHeader: "Bearer test-token-12345",
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Email Account Lookup", () => {
    test("should return 404 when email account not found", async () => {
      vi.mocked(prisma.emailAccount.findUnique).mockResolvedValueOnce(null);

      const request = createMockRequest({
        body: {
          tool: "getUserRulesAndSettings",
          input: {},
          userEmail: "notfound@example.com",
        },
        authHeader: "Bearer test-token-12345",
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.code).toBe("EMAIL_NOT_FOUND");
      expect(body.error).toContain("notfound@example.com");
    });

    test("should look up email account by userEmail", async () => {
      vi.mocked(prisma.emailAccount.findUnique).mockResolvedValueOnce({
        id: "account-123",
        email: "test@example.com",
        about: "Test user",
        account: { provider: "google" },
        rules: [],
      } as any);

      const request = createMockRequest({
        body: {
          tool: "getUserRulesAndSettings",
          input: {},
          userEmail: "test@example.com",
        },
        authHeader: "Bearer test-token-12345",
      });

      await POST(request);

      expect(prisma.emailAccount.findUnique).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
        select: expect.objectContaining({
          id: true,
          email: true,
        }),
      });
    });
  });

  describe("Tool Execution", () => {
    test("should return success response for getUserRulesAndSettings", async () => {
      vi.mocked(prisma.emailAccount.findUnique)
        // First call for email lookup
        .mockResolvedValueOnce({
          id: "account-123",
          email: "test@example.com",
          account: { provider: "google" },
        } as any)
        // Second call for getting rules and settings
        .mockResolvedValueOnce({
          about: "Test about info",
          rules: [
            {
              name: "Test Rule",
              instructions: "AI instructions",
              from: null,
              to: null,
              subject: null,
              conditionalOperator: "AND",
              enabled: true,
              runOnThreads: true,
              actions: [
                {
                  type: "ARCHIVE",
                  label: null,
                  content: null,
                  to: null,
                  cc: null,
                  bcc: null,
                  subject: null,
                  url: null,
                  folderName: null,
                },
              ],
            },
          ],
        } as any);

      const request = createMockRequest({
        body: {
          tool: "getUserRulesAndSettings",
          input: {},
          userEmail: "test@example.com",
        },
        authHeader: "Bearer test-token-12345",
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.result).toHaveProperty("about");
      expect(body.result).toHaveProperty("rules");
    });

    test("should return error for updateAbout when account not found", async () => {
      vi.mocked(prisma.emailAccount.findUnique)
        // First call for email lookup succeeds
        .mockResolvedValueOnce({
          id: "account-123",
          email: "test@example.com",
          account: { provider: "google" },
        } as any)
        // Second call for updateAbout returns null
        .mockResolvedValueOnce(null);

      const request = createMockRequest({
        body: {
          tool: "updateAbout",
          input: { about: "New about info" },
          userEmail: "test@example.com",
        },
        authHeader: "Bearer test-token-12345",
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200); // Tool execution succeeded
      expect(body.success).toBe(true);
      expect(body.result.error).toBe("Account not found");
    });
  });
});

describe("Validation Schema", () => {
  test("all valid tool names should be accepted", async () => {
    const validTools = [
      "getUserRulesAndSettings",
      "getLearnedPatterns",
      "createRule",
      "updateRuleConditions",
      "updateRuleActions",
      "updateLearnedPatterns",
      "updateAbout",
      "addToKnowledgeBase",
    ];

    for (const toolName of validTools) {
      vi.mocked(prisma.emailAccount.findUnique).mockResolvedValueOnce({
        id: "account-123",
        email: "test@example.com",
        account: { provider: "google" },
      } as any);

      const request = new NextRequest("http://localhost/api/llm-tools/invoke", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token-12345",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tool: toolName,
          input: {},
          userEmail: "test@example.com",
        }),
      });

      const response = await POST(request);
      // Should not return validation error for tool name
      const body = await response.json();
      if (!body.success && body.code === "VALIDATION_ERROR") {
        // If validation error, it should not be about tool name
        expect(body.error).not.toContain("tool");
      }
    }
  });
});
