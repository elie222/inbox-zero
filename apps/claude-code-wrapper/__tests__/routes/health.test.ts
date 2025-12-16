/**
 * Tests for health check endpoint (routes/health.ts).
 *
 * Tests the /health endpoint that verifies service status and Claude CLI availability.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { spawn } from "node:child_process";
import request from "supertest";
import express from "express";
import healthRouter from "../../src/routes/health.js";
import { createMockChildProcess } from "../helpers.js";

// Mock node:child_process
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);

// Create test app
function createTestApp() {
  const app = express();
  app.use(healthRouter);
  return app;
}

describe("Health Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /health", () => {
    it("returns healthy status when Claude CLI is available", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app).get("/health");

      // Simulate successful claude --version
      setTimeout(() => {
        mockProc.exitCode = 0;
        mockProc.emit("close", 0, null);
      }, 10);

      const res = await responsePromise;

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: "healthy",
        claudeCli: "available",
      });
      expect(res.body.timestamp).toBeDefined();
    });

    it("returns unhealthy status when Claude CLI exits non-zero", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app).get("/health");

      // Simulate failed claude --version
      setTimeout(() => {
        mockProc.exitCode = 1;
        mockProc.emit("close", 1, null);
      }, 10);

      const res = await responsePromise;

      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({
        status: "unhealthy",
        claudeCli: "unavailable",
        error: "Claude CLI not found or not accessible",
      });
    });

    it("returns unhealthy status when Claude CLI spawn fails", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app).get("/health");

      // Simulate spawn error (e.g., command not found)
      setTimeout(() => {
        mockProc.emit("error", new Error("ENOENT"));
      }, 10);

      const res = await responsePromise;

      expect(res.status).toBe(503);
      expect(res.body.status).toBe("unhealthy");
    });

    it("calls claude with --version flag", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app).get("/health");

      // Simulate successful response so the request completes
      setTimeout(() => {
        mockProc.exitCode = 0;
        mockProc.emit("close", 0, null);
      }, 10);

      await responsePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        ["--version"],
        expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }),
      );
    });

    it(
      "returns unhealthy status when CLI check times out",
      async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const mockProc = createMockChildProcess();
        mockSpawn.mockReturnValue(mockProc as never);

        const app = createTestApp();
        const responsePromise = request(app).get("/health");

        // Advance past the 5 second timeout without closing the process
        await vi.advanceTimersByTimeAsync(5001);

        const res = await responsePromise;

        expect(res.status).toBe(503);
        expect(res.body.status).toBe("unhealthy");
        expect(mockProc.kill).toHaveBeenCalled();

        vi.useRealTimers();
      },
      { timeout: 10_000 },
    );
  });
});
