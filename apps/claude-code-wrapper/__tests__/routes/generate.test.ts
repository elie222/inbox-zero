/**
 * Tests for generate endpoints (routes/generate.ts).
 *
 * Tests the /generate-text and /generate-object endpoints.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { spawn } from "node:child_process";
import request from "supertest";
import express from "express";
import generateRouter from "../../src/routes/generate.js";
import {
  createMockChildProcess,
  simulateCliSuccess,
  simulateCliError,
  createCliResultJson,
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
  app.use(generateRouter);
  return app;
}

describe("Generate Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /generate-text", () => {
    it("returns 400 when prompt is missing", async () => {
      const app = createTestApp();

      const res = await request(app).post("/generate-text").send({});

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        error: "Invalid request body",
        code: "VALIDATION_ERROR",
      });
    });

    it("returns 400 when prompt is not a string", async () => {
      const app = createTestApp();

      const res = await request(app)
        .post("/generate-text")
        .send({ prompt: 123 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("returns text response on successful CLI execution", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/generate-text")
        .send({ prompt: "Hello" });

      // Simulate successful CLI response
      setTimeout(() => {
        simulateCliSuccess(
          mockProc,
          createCliResultJson({
            result: "Hi there!",
            total_tokens_in: 5,
            total_tokens_out: 10,
            session_id: "session-123",
          }),
        );
      }, 10);

      const res = await responsePromise;

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        text: "Hi there!",
        usage: {
          inputTokens: 5,
          outputTokens: 10,
          totalTokens: 15,
        },
        sessionId: "session-123",
      });
    });

    it("passes system prompt to CLI", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/generate-text")
        .send({ prompt: "Hello", system: "Be helpful" });

      setTimeout(() => {
        simulateCliSuccess(mockProc, createCliResultJson({ result: "Hi!" }));
      }, 10);

      await responsePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        expect.arrayContaining(["--system-prompt", "Be helpful"]),
        expect.any(Object),
      );
    });

    it("passes model to CLI", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/generate-text")
        .send({ prompt: "Hello", model: "haiku" });

      setTimeout(() => {
        simulateCliSuccess(mockProc, createCliResultJson({ result: "Hi!" }));
      }, 10);

      await responsePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        expect.arrayContaining(["--model", "haiku"]),
        expect.any(Object),
      );
    });

    it("passes sessionId to CLI as --resume", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/generate-text")
        .send({ prompt: "Hello", sessionId: "session-abc" });

      setTimeout(() => {
        simulateCliSuccess(mockProc, createCliResultJson({ result: "Hi!" }));
      }, 10);

      await responsePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        expect.arrayContaining(["--resume", "session-abc"]),
        expect.any(Object),
      );
    });

    it("returns 500 with CLI error details on failure", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/generate-text")
        .send({ prompt: "Hello" });

      setTimeout(() => {
        simulateCliError(mockProc, "Rate limit exceeded", 1);
      }, 10);

      const res = await responsePromise;

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({
        code: "CLI_EXIT_ERROR",
      });
    });
  });

  describe("POST /generate-object", () => {
    const validSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      required: ["name"],
    };

    it("returns 400 when prompt is missing", async () => {
      const app = createTestApp();

      const res = await request(app)
        .post("/generate-object")
        .send({ schema: validSchema });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when schema is missing", async () => {
      const app = createTestApp();

      const res = await request(app)
        .post("/generate-object")
        .send({ prompt: "Generate a person" });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("returns parsed JSON object on success", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/generate-object")
        .send({ prompt: "Generate a person", schema: validSchema });

      setTimeout(() => {
        simulateCliSuccess(
          mockProc,
          createCliResultJson({
            result: '{"name": "Alice", "age": 30}',
          }),
        );
      }, 10);

      const res = await responsePromise;

      expect(res.status).toBe(200);
      expect(res.body.object).toEqual({ name: "Alice", age: 30 });
      expect(res.body.rawText).toBe('{"name": "Alice", "age": 30}');
      expect(res.body.usage).toBeDefined();
      expect(res.body.sessionId).toBeDefined();
    });

    it("extracts JSON from markdown code blocks", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/generate-object")
        .send({ prompt: "Generate a person", schema: validSchema });

      setTimeout(() => {
        simulateCliSuccess(
          mockProc,
          createCliResultJson({
            result: '```json\n{"name": "Bob"}\n```',
          }),
        );
      }, 10);

      const res = await responsePromise;

      expect(res.status).toBe(200);
      expect(res.body.object).toEqual({ name: "Bob" });
    });

    it("extracts JSON object from mixed text", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/generate-object")
        .send({ prompt: "Generate a person", schema: validSchema });

      setTimeout(() => {
        simulateCliSuccess(
          mockProc,
          createCliResultJson({
            result: 'Here is the result: {"name": "Charlie"} - done!',
          }),
        );
      }, 10);

      const res = await responsePromise;

      expect(res.status).toBe(200);
      expect(res.body.object).toEqual({ name: "Charlie" });
    });

    it("handles JSON arrays", async () => {
      const arraySchema = { type: "array", items: { type: "string" } };
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/generate-object")
        .send({ prompt: "Generate a list", schema: arraySchema });

      setTimeout(() => {
        simulateCliSuccess(
          mockProc,
          createCliResultJson({
            result: '["one", "two", "three"]',
          }),
        );
      }, 10);

      const res = await responsePromise;

      expect(res.status).toBe(200);
      expect(res.body.object).toEqual(["one", "two", "three"]);
    });

    it("returns 500 when JSON parsing fails", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/generate-object")
        .send({ prompt: "Generate a person", schema: validSchema });

      setTimeout(() => {
        simulateCliSuccess(
          mockProc,
          createCliResultJson({
            result: "This is not valid JSON at all",
          }),
        );
      }, 10);

      const res = await responsePromise;

      expect(res.status).toBe(500);
      expect(res.body.code).toBe("INTERNAL_ERROR");
      expect(res.body.error).toContain("Failed to parse JSON");
    });

    it("includes schema in enhanced prompt", async () => {
      const mockProc = createMockChildProcess();
      mockSpawn.mockReturnValue(mockProc as never);

      const app = createTestApp();
      const responsePromise = request(app)
        .post("/generate-object")
        .send({ prompt: "Generate a person", schema: validSchema });

      setTimeout(() => {
        simulateCliSuccess(
          mockProc,
          createCliResultJson({ result: '{"name": "Test"}' }),
        );
      }, 10);

      await responsePromise;

      // Check that the prompt was enhanced with schema
      const spawnCall = mockSpawn.mock.calls[0];
      const promptArg = spawnCall[1][spawnCall[1].length - 1];
      expect(promptArg).toContain("JSON Schema");
      expect(promptArg).toContain('"type": "object"');
    });
  });
});
