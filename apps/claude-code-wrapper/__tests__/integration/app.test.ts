/**
 * Integration tests for the full Express app.
 *
 * Tests the complete request lifecycle including auth middleware,
 * routing, and error handling.
 */

import { describe, it, expect, vi } from "vitest";
import { spawn } from "node:child_process";
import request from "supertest";
import { createMockChildProcess, createCliResultJson } from "../helpers.js";

// Set required environment variable BEFORE any imports
// Using vi.hoisted to ensure this runs at the earliest possible time
const TEST_API_KEY = vi.hoisted(() => {
  const key = "test-api-key-12345";
  process.env.CLAUDE_CODE_WRAPPER_API_KEY = key;
  return key;
});

// Mock node:child_process for CLI subprocess
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);

// Import app after env var is set
import app from "../../src/index.js";

describe("Claude Code Wrapper App (Integration)", () => {
  const validAuthHeader = `Bearer ${TEST_API_KEY}`;

  describe("Authentication", () => {
    it("allows /health without authentication", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const responsePromise = request(app).get("/health");

      // Simulate successful claude --version check
      setTimeout(() => {
        mockProc.exitCode = 0;
        mockProc.emit("close", 0, null);
      }, 10);

      const res = await responsePromise;

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
    });

    it("returns 401 when auth header is missing", async () => {
      const res = await request(app)
        .post("/generate-text")
        .send({ prompt: "Hello" });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Missing authorization header");
    });

    it("returns 401 when auth header is not Bearer", async () => {
      const res = await request(app)
        .post("/generate-text")
        .set("Authorization", "Basic some-token")
        .send({ prompt: "Hello" });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Missing authorization header");
    });

    it("returns 403 when API key is invalid", async () => {
      const res = await request(app)
        .post("/generate-text")
        .set("Authorization", "Bearer wrong-key")
        .send({ prompt: "Hello" });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Invalid API key");
    });

    it("allows requests with valid API key", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const responsePromise = request(app)
        .post("/generate-text")
        .set("Authorization", validAuthHeader)
        .send({ prompt: "Hello" });

      setTimeout(() => {
        mockProc.stdout.emit(
          "data",
          Buffer.from(createCliResultJson({ result: "Hi!" })),
        );
        mockProc.exitCode = 0;
        mockProc.emit("close", 0, null);
      }, 10);

      const res = await responsePromise;

      expect(res.status).toBe(200);
      expect(res.body.text).toBe("Hi!");
    });
  });

  describe("Routing", () => {
    it("returns 404 for unknown routes", async () => {
      const res = await request(app)
        .get("/unknown-route")
        .set("Authorization", validAuthHeader);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Not found");
    });

    it("routes GET /health correctly", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const responsePromise = request(app).get("/health");

      setTimeout(() => {
        mockProc.exitCode = 0;
        mockProc.emit("close", 0, null);
      }, 10);

      const res = await responsePromise;

      expect(res.status).toBe(200);
    });

    it("routes POST /generate-text correctly", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const responsePromise = request(app)
        .post("/generate-text")
        .set("Authorization", validAuthHeader)
        .send({ prompt: "Hello" });

      setTimeout(() => {
        mockProc.stdout.emit(
          "data",
          Buffer.from(createCliResultJson({ result: "Response" })),
        );
        mockProc.exitCode = 0;
        mockProc.emit("close", 0, null);
      }, 10);

      const res = await responsePromise;

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("text");
      expect(res.body).toHaveProperty("usage");
      expect(res.body).toHaveProperty("sessionId");
    });

    it("routes POST /generate-object correctly", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const responsePromise = request(app)
        .post("/generate-object")
        .set("Authorization", validAuthHeader)
        .send({
          prompt: "Generate data",
          schema: { type: "object", properties: { name: { type: "string" } } },
        });

      setTimeout(() => {
        mockProc.stdout.emit(
          "data",
          Buffer.from(createCliResultJson({ result: '{"name": "Test"}' })),
        );
        mockProc.exitCode = 0;
        mockProc.emit("close", 0, null);
      }, 10);

      const res = await responsePromise;

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("object");
      expect(res.body).toHaveProperty("rawText");
      expect(res.body).toHaveProperty("usage");
    });

    it("routes POST /stream correctly with SSE headers", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const responsePromise = request(app)
        .post("/stream")
        .set("Authorization", validAuthHeader)
        .send({ prompt: "Hello" });

      setTimeout(() => {
        mockProc.emit("close", 0, null);
      }, 50);

      const res = await responsePromise;

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("text/event-stream");
    });
  });

  describe("Request Body Handling", () => {
    it("handles JSON request bodies", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const responsePromise = request(app)
        .post("/generate-text")
        .set("Authorization", validAuthHeader)
        .set("Content-Type", "application/json")
        .send({ prompt: "Test prompt" });

      setTimeout(() => {
        mockProc.stdout.emit(
          "data",
          Buffer.from(createCliResultJson({ result: "Response" })),
        );
        mockProc.exitCode = 0;
        mockProc.emit("close", 0, null);
      }, 10);

      const res = await responsePromise;

      expect(res.status).toBe(200);
    });

    it("handles malformed JSON via error handler", async () => {
      const res = await request(app)
        .post("/generate-text")
        .set("Authorization", validAuthHeader)
        .set("Content-Type", "application/json")
        .send("not valid json");

      // Express JSON parser error is caught by error handler middleware
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Internal server error");
    });
  });
});
