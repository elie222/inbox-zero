/**
 * Global test setup for Claude Code Wrapper tests.
 *
 * Configures mock defaults and ensures consistent test environment.
 */

import { vi, beforeEach, afterEach } from "vitest";

// Reset all mocks between tests to ensure isolation
beforeEach(() => {
  vi.clearAllMocks();

  // Suppress console output during tests unless DEBUG_TESTS is set
  // Must be in beforeEach since afterEach calls restoreAllMocks()
  if (!process.env.DEBUG_TESTS) {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});
