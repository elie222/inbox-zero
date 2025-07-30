import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodIssue } from "zod";
import {
  withError,
  withAuth,
  withEmailAccount,
  type RequestWithAuth,
  type NextHandler,
} from "./middleware";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";

// --- Mocks ---

// Mock server-only as per rule
vi.mock("server-only", () => ({}));

// Mock external dependencies
vi.mock("next-auth", () => {
  // Define the mock function INSIDE the factory
  const mockAuthFn = vi.fn();
  return {
    // Mock the default export (the NextAuth function)
    default: vi.fn(() => ({
      // This is the object returned when NextAuth() is called
      handlers: { GET: vi.fn(), POST: vi.fn() }, // Mock handlers as needed
      auth: mockAuthFn, // Ensure the object has the 'auth' property pointing to our mock
      signIn: vi.fn(),
      signOut: vi.fn(),
    })),
    // Also provide the named export for completeness, pointing to the same mock
    auth: mockAuthFn,
  };
});

vi.mock("@/utils/redis/account-validation");

// Mock specific functions from @/utils/error, keep original SafeError
vi.mock("@/utils/error", async (importActual) => {
  const actual = await importActual<typeof import("@/utils/error")>();
  return {
    ...actual, // Keep original exports like SafeError
    captureException: vi.fn(), // Mock only specific functions
    checkCommonErrors: vi.fn(),
  };
});

vi.mock("@/utils/error.server");

// Import from the local path as before
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getEmailAccount } from "@/utils/redis/account-validation";
import { captureException, checkCommonErrors, SafeError } from "@/utils/error";

// This should now correctly reference mockAuthFn
const mockAuth = vi.mocked(auth);

const mockGetEmailAccount = vi.mocked(getEmailAccount);
const mockCheckCommonErrors = vi.mocked(checkCommonErrors);
const mockCaptureException = vi.mocked(captureException);

// Helper to create a mock NextRequest
const createMockRequest = (
  method = "GET",
  url = "http://localhost/test",
  headers?: Record<string, string>,
): NextRequest => {
  const request = new NextRequest(url, {
    method,
    headers: new Headers(headers),
  });
  // Add clone method mock if needed, NextRequest handles it mostly
  request.clone = vi.fn(() => request) as any; // Basic clone mock
  return request;
};

// --- Test Suite ---

describe("Middleware", () => {
  let mockReq: NextRequest;
  const mockContext = { params: Promise.resolve({}) };

  beforeEach(() => {
    vi.resetAllMocks();
    mockReq = createMockRequest();
  });

  // --- withError Tests ---
  describe("withError", () => {
    it("should call the handler and return its response on success", async () => {
      const mockResponse = NextResponse.json({ success: true });
      const handler = vi.fn().mockResolvedValue(mockResponse);
      const wrappedHandler = withError(handler);

      const response = await wrappedHandler(mockReq, mockContext);
      const responseBody = await response.json();

      expect(handler).toHaveBeenCalledWith(mockReq, mockContext);
      expect(response.status).toBe(200);
      expect(responseBody).toEqual({ success: true });
    });

    it("should return 400 for ZodError", async () => {
      const zodError = new ZodError([
        { path: ["field"], message: "Required" },
      ] as ZodIssue[]);
      const handler = vi.fn().mockRejectedValue(zodError);
      const wrappedHandler = withError(handler);

      const response = await wrappedHandler(mockReq, mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(400);
      expect(responseBody).toEqual({
        error: { issues: zodError.issues },
        isKnownError: true,
      });
    });

    it("should return 400 for SafeError", async () => {
      const safeError = new SafeError("User-friendly message");
      const handler = vi.fn().mockRejectedValue(safeError);
      const wrappedHandler = withError(handler);

      const response = await wrappedHandler(mockReq, mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(400);
      expect(responseBody).toEqual({
        error: "User-friendly message",
        isKnownError: true,
      });
    });

    it("should handle common errors using checkCommonErrors", async () => {
      const commonError = { message: "API Error", code: 409, type: "Conflict" };
      mockCheckCommonErrors.mockReturnValue(commonError);
      const handler = vi.fn().mockRejectedValue(new Error("Some API error"));
      const wrappedHandler = withError(handler);

      const response = await wrappedHandler(mockReq, mockContext);
      const responseBody = await response.json();

      expect(checkCommonErrors).toHaveBeenCalled();
      expect(response.status).toBe(commonError.code);
      expect(responseBody).toEqual({
        error: commonError.message,
        isKnownError: true,
      });
    });

    it("should return 500 and capture unhandled errors", async () => {
      const unexpectedError = new Error("Something went very wrong");
      mockCheckCommonErrors.mockReturnValue(null); // Ensure it's not a common error
      const handler = vi.fn().mockRejectedValue(unexpectedError);
      const wrappedHandler = withError(handler);

      const response = await wrappedHandler(mockReq, mockContext);
      const responseBody = await response.json();

      expect(checkCommonErrors).toHaveBeenCalled();
      expect(mockCaptureException).toHaveBeenCalledWith(unexpectedError, {
        extra: { url: mockReq.url },
      });
      expect(response.status).toBe(500);
      expect(responseBody).toEqual({ error: "An unexpected error occurred" });
    });
  });

  // --- withAuth Tests ---
  describe("withAuth", () => {
    const mockUserId = "user-123";

    it("should call the handler with auth info if session exists", async () => {
      mockAuth.mockResolvedValue({ user: { id: mockUserId } } as any);
      // Adjust handler mock signature
      const handler = vi.fn(async (_req: RequestWithAuth, _ctx: any) =>
        NextResponse.json({ ok: true }),
      );
      const wrappedHandler = withAuth(handler);

      await wrappedHandler(mockReq, mockContext);

      expect(auth).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: { userId: mockUserId },
        }),
        mockContext,
      );
    });

    it("should return 401 if session does not exist", async () => {
      mockAuth.mockResolvedValue(null as any);
      const handler: NextHandler<RequestWithAuth> = vi.fn();
      const wrappedHandler = withAuth(handler);

      const response = await wrappedHandler(mockReq, mockContext);
      const responseBody = await response.json();

      expect(auth).toHaveBeenCalledTimes(1);
      expect(handler).not.toHaveBeenCalled();
      expect(response.status).toBe(401);
      expect(responseBody).toEqual({
        error: "Unauthorized",
        isKnownError: true,
      });
    });
  });

  // --- withEmailAccount Tests ---
  describe("withEmailAccount", () => {
    type RequestWithAuthAndEmail = RequestWithAuth & {
      auth: { emailAccountId: string; email: string };
    };

    const mockUserId = "user-123";
    const mockAccountId = "acc-456";
    const mockEmail = "test@example.com";

    beforeEach(() => {
      // Mock auth middleware part for these tests
      mockAuth.mockResolvedValue({ user: { id: mockUserId } } as any);
    });

    it("should call handler with email account info if header exists and account is valid", async () => {
      mockReq = createMockRequest("GET", "http://localhost/api/test", {
        [EMAIL_ACCOUNT_HEADER]: mockAccountId,
      });
      mockGetEmailAccount.mockResolvedValue(mockEmail);

      const handler = vi.fn(async (_req: RequestWithAuthAndEmail, _ctx: any) =>
        NextResponse.json({ success: true }),
      );
      const wrappedHandler = withEmailAccount(handler);

      await wrappedHandler(mockReq, mockContext);

      expect(getEmailAccount).toHaveBeenCalledWith({
        userId: mockUserId,
        emailAccountId: mockAccountId,
      });
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: {
            userId: mockUserId,
            emailAccountId: mockAccountId,
            email: mockEmail,
          },
        }),
        mockContext,
      );
    });

    it("should return 403 if email account header is missing", async () => {
      // No header added to mockReq in beforeEach
      // Provide a typed mock implementation to satisfy the wrapper
      const handler = vi.fn(
        async (
          _req: RequestWithAuthAndEmail,
          _ctx: { params: Promise<Record<string, string>> },
        ): Promise<NextResponse> => {
          // Implementation won't run, just for types
          return NextResponse.json({});
        },
      );
      const wrappedHandler = withEmailAccount(handler);

      const response = await wrappedHandler(mockReq, mockContext);
      const responseBody = await response.json();

      expect(auth).toHaveBeenCalledTimes(1); // Auth middleware runs first
      expect(getEmailAccount).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
      expect(response.status).toBe(403);
      expect(responseBody).toEqual({
        error: "Email account ID is required",
        isKnownError: true,
      });
    });

    it("should return 403 if email account ID is invalid", async () => {
      mockReq = createMockRequest("GET", "http://localhost/api/test", {
        [EMAIL_ACCOUNT_HEADER]: mockAccountId,
      });
      mockGetEmailAccount.mockResolvedValue(null); // Simulate invalid account

      // Provide a typed mock implementation to satisfy the wrapper
      const handler = vi.fn(
        async (
          _req: RequestWithAuthAndEmail,
          _ctx: { params: Promise<Record<string, string>> },
        ): Promise<NextResponse> => {
          // Implementation won't run, just for types
          return NextResponse.json({});
        },
      );
      const wrappedHandler = withEmailAccount(handler);

      const response = await wrappedHandler(mockReq, mockContext);
      const responseBody = await response.json();

      expect(auth).toHaveBeenCalledTimes(1);
      expect(getEmailAccount).toHaveBeenCalledWith({
        userId: mockUserId,
        emailAccountId: mockAccountId,
      });
      expect(handler).not.toHaveBeenCalled();
      expect(response.status).toBe(403);
      expect(responseBody).toEqual({
        error: "Invalid account ID",
        isKnownError: true,
      });
    });
  });
});
