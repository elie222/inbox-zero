import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { SafeError } from "@/utils/error";
import {
  createPublicApiErrorBody,
  isPublicApiPath,
  publicApiErrorCodeFromStatus,
  publicApiErrorFromUnknown,
  publicApiErrorResponse,
} from "@/utils/public-api-error";

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
          received: "undefined",
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
});
