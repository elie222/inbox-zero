/**
 * Test helpers and mock factories for Claude Code Wrapper tests.
 *
 * Provides utilities for creating mock CLI processes, responses, and SSE streams.
 */

import { EventEmitter } from "node:events";
import { vi } from "vitest";
import type { ClaudeCliOutput } from "../src/types.js";

// =============================================================================
// Mock Child Process
// =============================================================================

export interface MockChildProcess extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { end: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
  killed: boolean;
  exitCode: number | null;
}

/**
 * Creates a mock child process that mimics Node.js spawn() return value.
 * Use this to test CLI execution without actually spawning processes.
 */
export function createMockChildProcess(): MockChildProcess {
  const proc = new EventEmitter() as MockChildProcess;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { end: vi.fn() };
  proc.kill = vi.fn();
  proc.killed = false;
  proc.exitCode = null;
  return proc;
}

/**
 * Simulates successful CLI completion with output data.
 */
export function simulateCliSuccess(
  proc: MockChildProcess,
  output: string,
  exitCode = 0,
): void {
  proc.stdout.emit("data", Buffer.from(output));
  proc.exitCode = exitCode;
  proc.emit("close", exitCode, null);
}

/**
 * Simulates CLI failure with error output.
 */
export function simulateCliError(
  proc: MockChildProcess,
  stderr: string,
  exitCode = 1,
): void {
  proc.stderr.emit("data", Buffer.from(stderr));
  proc.exitCode = exitCode;
  proc.emit("close", exitCode, null);
}

/**
 * Simulates spawn error (e.g., command not found).
 */
export function simulateSpawnError(proc: MockChildProcess, error: Error): void {
  proc.emit("error", error);
}

// =============================================================================
// CLI Output Fixtures
// =============================================================================

/**
 * Creates a valid Claude CLI result output object.
 */
export function createCliResultOutput(
  overrides: Partial<ClaudeCliOutput> = {},
): ClaudeCliOutput {
  return {
    type: "result",
    result: "Hello! How can I help you today?",
    session_id: "test-session-123",
    total_tokens_in: 10,
    total_tokens_out: 15,
    cost_usd: 0.001,
    duration_ms: 500,
    ...overrides,
  };
}

/**
 * Creates a JSON string of CLI result output (as stdout would produce).
 */
export function createCliResultJson(
  overrides: Partial<ClaudeCliOutput> = {},
): string {
  return JSON.stringify(createCliResultOutput(overrides));
}

/**
 * Creates a stream-json assistant message (for streaming tests).
 */
export function createStreamAssistantMessage(text: string): string {
  return JSON.stringify({
    type: "assistant",
    message: {
      content: [{ type: "text", text }],
    },
  });
}

/**
 * Creates a stream-json result message (for streaming tests).
 */
export function createStreamResultMessage(
  overrides: Partial<{
    session_id: string;
    total_tokens_in: number;
    total_tokens_out: number;
  }> = {},
): string {
  return JSON.stringify({
    type: "result",
    session_id: "test-session-123",
    total_tokens_in: 10,
    total_tokens_out: 15,
    ...overrides,
  });
}

// =============================================================================
// SSE Helpers
// =============================================================================

export interface SSEEvent {
  event: string;
  data: unknown;
}

/**
 * Parses raw SSE text into structured events.
 * Useful for asserting on SSE response content.
 */
export function parseSSEResponse(raw: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const eventBlocks = raw.split("\n\n").filter(Boolean);

  for (const block of eventBlocks) {
    const lines = block.split("\n");
    let eventType = "";
    let data = "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7);
      } else if (line.startsWith("data: ")) {
        data = line.slice(6);
      }
    }

    if (eventType && data) {
      try {
        events.push({ event: eventType, data: JSON.parse(data) });
      } catch {
        events.push({ event: eventType, data });
      }
    }
  }

  return events;
}

/**
 * Creates SSE formatted text for a single event.
 */
export function createSSEEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// =============================================================================
// Express Mock Helpers
// =============================================================================

export interface MockResponse {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  flushHeaders: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  writtenData: string[];
  statusCode: number;
}

/**
 * Creates a mock Express response object for unit testing routes.
 */
export function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    writtenData: [],
    status: vi.fn().mockImplementation((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    flushHeaders: vi.fn().mockReturnThis(),
    write: vi.fn().mockImplementation((data: string) => {
      res.writtenData.push(data);
      return true;
    }),
    end: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
  };
  return res;
}

/**
 * Creates a mock Express request object.
 */
export function createMockRequest(body: unknown = {}): {
  body: unknown;
  on: ReturnType<typeof vi.fn>;
} {
  return {
    body,
    on: vi.fn(),
  };
}

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Waits for a specified number of milliseconds.
 * Useful for testing async behavior like timeouts.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Advances fake timers and flushes promises.
 * Useful when testing timeout behavior with vi.useFakeTimers().
 */
export async function advanceTimersAndFlush(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
  await vi.runAllTimersAsync();
}
