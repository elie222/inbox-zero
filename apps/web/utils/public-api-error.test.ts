import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { SafeError } from "@/utils/error";
import {
  createPublicApiErrorBody,
  createPublicApiMethodNotAllowedHandler,
  isPublicApiPath,
  publicApiErrorCodeFromStatus,
  publicApiErrorFromUnknown,
  publicApiErrorResponse,
  readPublicApiJson,
} from "@/utils/public-api-error";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("public-api-error", () => {
  it("detects public API paths", () => {
    expect(isPublicApiPath("/api/v1")).toBe(true);
    expect(isPublicApiPath("/api/v1/rules")).toBe(true);
    expect(isPublicApiPath("/api/user")).toBe(false);
    expect(isPublicApiPath("/openapi.json")).toBe(false);
  });

  it("maps HTTP statuses to stable error codes", () => {
    expect(publicApiErrorCodeFromStatus(400)).toBe("BAD_REQUEST");
    expect(publicApiErrorCodeFromStatus(401)).toBe("UNAUTHORIZED");
    expect(publicApiErrorCodeFromStatus(403)).toBe("FORBIDDEN");
    expect(publicApiErrorCodeFromStatus(404)).toBe("NOT_FOUND");
    expect(publicApiErrorCodeFromStatus(405)).toBe("METHOD_NOT_ALLOWED");
    expect(publicApiErrorCodeFromStatus(429)).toBe("RATE_LIMITED");
    expect(publicApiErrorCodeFromStatus(500)).toBe("INTERNAL_ERROR");
  });

  it("returns structured JSON error bodies with code, message, and hint", async () => {
    const response = publicApiErrorResponse({
      status: 401,
      message: "Missing API key",
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual(
      createPublicApiErrorBody({
        code: "UNAUTHORIZED",
        message: "Missing API key",
      }),
    );
    expect(body.error.hint).toContain("API-Key");
  });

  it("converts Zod and SafeError failures into structured public API errors", async () => {
    const zodResponse = publicApiErrorFromUnknown(
      new ZodError([
        {
          code: "invalid_type",
          expected: "string",
          path: ["name"],
          message: "Required",
        },
      ]),
    );
    const zodBody = await zodResponse.json();

    expect(zodResponse.status).toBe(400);
    expect(zodBody.error).toMatchObject({
      code: "BAD_REQUEST",
      message: "Required (name)",
    });

    const authResponse = publicApiErrorFromUnknown(
      new SafeError("Invalid API key", 401),
    );
    const authBody = await authResponse.json();

    expect(authResponse.status).toBe(401);
    expect(authBody.error).toMatchObject({
      code: "UNAUTHORIZED",
      message: "Invalid API key",
    });
  });

  it("rejects malformed JSON as a structured bad request", async () => {
    const request = new Request("https://example.com/api/v1/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });

    await expect(readPublicApiJson(request)).rejects.toMatchObject({
      safeMessage: "Request body must be valid JSON",
      statusCode: 400,
    });
  });

  it("returns structured method errors with an Allow header", async () => {
    const response = createPublicApiMethodNotAllowedHandler(["GET", "POST"])();
    const body = await response.json();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST");
    expect(body.error).toMatchObject({
      code: "METHOD_NOT_ALLOWED",
      message: "Method not allowed",
    });
  });
});
