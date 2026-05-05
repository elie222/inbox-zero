vi.mock("server-only", () => ({}));

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const FIXED_DATE = new Date("2026-05-03T10:01:18.695Z");

const { healthEnv, mockLogger } = vi.hoisted(() => ({
  healthEnv: {
    HEALTH_API_KEY: "health-secret",
  },
  mockLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
}));

vi.mock("@/env", () => ({
  env: healthEnv,
}));

vi.mock("@/utils/prisma");

vi.mock("@/utils/middleware", () => ({
  withError:
    (
      _scope: string,
      handler: (
        request: NextRequest & {
          logger: typeof mockLogger;
        },
      ) => Promise<Response>,
    ) =>
    async (request: NextRequest) => {
      const requestWithLogger = request as NextRequest & {
        logger: typeof mockLogger;
      };
      requestWithLogger.logger = mockLogger;
      return handler(requestWithLogger);
    },
}));

import { GET } from "./route";

describe("health route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_DATE);
    vi.clearAllMocks();
    healthEnv.HEALTH_API_KEY = "health-secret";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a lightweight ok response when no health API key is provided", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/api/health"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("runs the deep database health check when the API key matches", async () => {
    prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }] as never);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/health", {
        headers: { "x-health-api-key": "health-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "healthy",
      timestamp: FIXED_DATE.toISOString(),
      database: {
        status: "healthy",
      },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("rejects deep health checks with the wrong API key", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/health", {
        headers: { "x-health-api-key": "wrong-key" },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns unhealthy when the database query fails", async () => {
    const error = new Error("db unavailable");
    prisma.$queryRaw.mockRejectedValue(error);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/health", {
        headers: { "x-health-api-key": "health-secret" },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "unhealthy",
      timestamp: FIXED_DATE.toISOString(),
      error: "Database connection failed",
    });
    expect(mockLogger.error).toHaveBeenCalledWith("Health check failed", {
      error,
    });
  });
});
