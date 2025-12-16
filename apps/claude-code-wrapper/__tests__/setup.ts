/**
 * Global test setup for Claude Code Wrapper tests.
 *
 * Configures mock defaults and ensures consistent test environment.
 */

import { vi, beforeEach, afterEach } from "vitest";

// Reset all mocks between tests to ensure isolation
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Suppress console output during tests unless DEBUG_TESTS is set
if (!process.env.DEBUG_TESTS) {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
}
