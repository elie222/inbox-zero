/**
 * Tests for streaming endpoint (routes/stream.ts).
 *
 * Tests the /stream endpoint which provides Server-Sent Events (SSE) streaming.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import request from "supertest";
import express from "express";
import streamRouter from "../../src/routes/stream.js";
import {
  createMockChildProcess,
  createStreamAssistantMessage,
  createStreamResultMessage,
  parseSSEResponse,
} from "../helpers.js";

// Mock node:child_process
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);

// Create test app
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(streamRouter);
  return app;
}

describe("Stream Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("POST /stream", () => {
    it("returns 400 when prompt is missing", async () => {
      const app = createTestApp();

      const res = await request(app).post("/stream").send({});

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        error: "Invalid request body",
        code: "VALIDATION_ERROR",
      });
    });

    it("sets correct SSE headers", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/stream")
        .send({ prompt: "Hello" });

      // Complete the stream quickly
      setTimeout(() => {
        mockProc.emit("close", 0, null);
      }, 50);

      const res = await responsePromise;

      expect(res.headers["content-type"]).toBe("text/event-stream");
      expect(res.headers["cache-control"]).toBe("no-cache");
      expect(res.headers.connection).toBe("keep-alive");
      expect(res.headers["x-accel-buffering"]).toBe("no");
    });

    it("emits session event with sessionId", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/stream")
        .send({ prompt: "Hello" });

      setTimeout(() => {
        mockProc.emit("close", 0, null);
      }, 50);

      const res = await responsePromise;
      const events = parseSSEResponse(res.text);

      const sessionEvent = events.find((e) => e.event === "session");
      expect(sessionEvent).toBeDefined();
      expect(
        (sessionEvent?.data as { sessionId: string }).sessionId,
      ).toBeDefined();
    });

    it("streams text chunks as SSE events", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/stream")
        .send({ prompt: "Hello" });

      setTimeout(() => {
        // Simulate streaming text chunks
        mockProc.stdout.emit(
          "data",
          Buffer.from(`${createStreamAssistantMessage("Hello ")}\n`),
        );
        mockProc.stdout.emit(
          "data",
          Buffer.from(`${createStreamAssistantMessage("World!")}\n`),
        );
        mockProc.stdout.emit(
          "data",
          Buffer.from(`${createStreamResultMessage()}\n`),
        );
        mockProc.emit("close", 0, null);
      }, 50);

      const res = await responsePromise;
      const events = parseSSEResponse(res.text);

      const textEvents = events.filter((e) => e.event === "text");
      expect(textEvents.length).toBe(2);
      expect((textEvents[0].data as { text: string }).text).toBe("Hello ");
      expect((textEvents[1].data as { text: string }).text).toBe("World!");
    });

    it("emits result event with usage data", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/stream")
        .send({ prompt: "Hello" });

      setTimeout(() => {
        mockProc.stdout.emit(
          "data",
          Buffer.from(
            `${createStreamResultMessage({
              total_tokens_in: 10,
              total_tokens_out: 20,
            })}\n`,
          ),
        );
        mockProc.emit("close", 0, null);
      }, 50);

      const res = await responsePromise;
      const events = parseSSEResponse(res.text);

      const resultEvent = events.find((e) => e.event === "result");
      expect(resultEvent).toBeDefined();
      expect(
        (resultEvent?.data as { usage: { inputTokens: number } }).usage
          .inputTokens,
      ).toBe(10);
      expect(
        (resultEvent?.data as { usage: { outputTokens: number } }).usage
          .outputTokens,
      ).toBe(20);
      expect(
        (resultEvent?.data as { usage: { totalTokens: number } }).usage
          .totalTokens,
      ).toBe(30);
    });

    it("emits done event when stream completes", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/stream")
        .send({ prompt: "Hello" });

      setTimeout(() => {
        mockProc.emit("close", 0, null);
      }, 50);

      const res = await responsePromise;
      const events = parseSSEResponse(res.text);

      const doneEvent = events.find((e) => e.event === "done");
      expect(doneEvent).toBeDefined();
      expect((doneEvent?.data as { code: number }).code).toBe(0);
    });

    it("emits error event on CLI non-zero exit", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/stream")
        .send({ prompt: "Hello" });

      setTimeout(() => {
        mockProc.stderr.emit("data", Buffer.from("Rate limit exceeded"));
        mockProc.exitCode = 1;
        mockProc.emit("close", 1, null);
      }, 50);

      const res = await responsePromise;
      const events = parseSSEResponse(res.text);

      const errorEvent = events.find((e) => e.event === "error");
      expect(errorEvent).toBeDefined();
      expect((errorEvent?.data as { code: string }).code).toBe(
        "CLI_EXIT_ERROR",
      );
      expect((errorEvent?.data as { error: string }).error).toContain(
        "Rate limit exceeded",
      );
    });

    it("handles line buffering for split JSON", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/stream")
        .send({ prompt: "Hello" });

      setTimeout(() => {
        // Simulate TCP chunking - JSON split across two data events
        const fullMessage = createStreamAssistantMessage("Complete");
        mockProc.stdout.emit("data", Buffer.from(fullMessage.slice(0, 20)));
        mockProc.stdout.emit("data", Buffer.from(`${fullMessage.slice(20)}\n`));
        mockProc.emit("close", 0, null);
      }, 50);

      const res = await responsePromise;
      const events = parseSSEResponse(res.text);

      const textEvents = events.filter((e) => e.event === "text");
      expect(textEvents.length).toBe(1);
      expect((textEvents[0].data as { text: string }).text).toBe("Complete");
    });

    it("handles non-JSON lines as raw text", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/stream")
        .send({ prompt: "Hello" });

      setTimeout(() => {
        // Emit a non-JSON line
        mockProc.stdout.emit("data", Buffer.from("This is not JSON\n"));
        mockProc.emit("close", 0, null);
      }, 50);

      const res = await responsePromise;
      const events = parseSSEResponse(res.text);

      const textEvents = events.filter((e) => e.event === "text");
      expect(textEvents.length).toBe(1);
      expect((textEvents[0].data as { text: string }).text).toBe(
        "This is not JSON",
      );
    });

    it("passes model option to CLI", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/stream")
        .send({ prompt: "Hello", model: "sonnet" });

      setTimeout(() => {
        mockProc.emit("close", 0, null);
      }, 50);

      await responsePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        expect.arrayContaining(["--model", "sonnet"]),
        expect.any(Object),
      );
    });

    it("includes --verbose flag for stream-json", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/stream")
        .send({ prompt: "Hello" });

      setTimeout(() => {
        mockProc.emit("close", 0, null);
      }, 50);

      await responsePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        expect.arrayContaining(["--verbose", "--output-format", "stream-json"]),
        expect.any(Object),
      );
    });

    it("uses --resume when sessionId is provided", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/stream")
        .send({ prompt: "Hello", sessionId: "session-xyz" });

      setTimeout(() => {
        mockProc.emit("close", 0, null);
      }, 50);

      await responsePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        expect.arrayContaining(["--resume", "session-xyz"]),
        expect.any(Object),
      );
    });

    it("closes stdin after spawn", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/stream")
        .send({ prompt: "Hello" });

      setTimeout(() => {
        mockProc.emit("close", 0, null);
      }, 50);

      await responsePromise;

      expect(mockProc.stdin.end).toHaveBeenCalled();
    });

    it("emits error event on spawn failure", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/stream")
        .send({ prompt: "Hello" });

      setTimeout(() => {
        // Simulate spawn error (e.g., command not found)
        mockProc.emit("error", new Error("ENOENT: command not found"));
      }, 50);

      const res = await responsePromise;
      const events = parseSSEResponse(res.text);

      const errorEvent = events.find((e) => e.event === "error");
      expect(errorEvent).toBeDefined();
      expect((errorEvent?.data as { code: string }).code).toBe("SPAWN_ERROR");
      expect((errorEvent?.data as { error: string }).error).toContain("ENOENT");

      const doneEvent = events.find((e) => e.event === "done");
      expect(doneEvent).toBeDefined();
    });

    it("processes remaining buffer on close", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/stream")
        .send({ prompt: "Hello" });

      setTimeout(() => {
        // Send a result message without trailing newline (remains in buffer)
        const resultMsg = JSON.stringify({
          type: "result",
          session_id: "buffered-session",
          total_tokens_in: 5,
          total_tokens_out: 10,
        });
        mockProc.stdout.emit("data", Buffer.from(resultMsg));
        // Close without newline - buffer should be processed in close handler
        mockProc.emit("close", 0, null);
      }, 50);

      const res = await responsePromise;
      const events = parseSSEResponse(res.text);

      const resultEvent = events.find((e) => e.event === "result");
      expect(resultEvent).toBeDefined();
      expect((resultEvent?.data as { sessionId: string }).sessionId).toBe(
        "buffered-session",
      );
    });

    it("includes system prompt when provided", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/stream")
        .send({ prompt: "Hello", system: "Be helpful" });

      setTimeout(() => {
        mockProc.emit("close", 0, null);
      }, 50);

      await responsePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        expect.arrayContaining(["--system-prompt", "Be helpful"]),
        expect.any(Object),
      );
    });

    // NOTE: Stream timeout (10 min) cannot be tested with supertest + fake timers.
    // Supertest creates real TCP connections that don't respect fake timers.
    // The health check timeout test (5s) works because shouldAdvanceTime can
    // accelerate short durations, but 10 minutes is too long.
    // The timeout logic (stream.ts:120-133) is straightforward - it sends an
    // error event, kills the process, and closes the response.
    // biome-ignore lint/suspicious/noSkippedTests: Requires E2E or configurable timeout
    it.skip("times out and sends error event after 10 minutes", () => {
      // See NOTE above - this test requires E2E testing or refactoring
      // the timeout to be configurable for testing.
    });
  });
});
