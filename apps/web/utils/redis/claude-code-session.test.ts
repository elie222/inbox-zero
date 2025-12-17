import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted() to declare mocks that can be used in vi.mock factories
const { mockGet, mockSet, mockDel } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockDel: vi.fn(),
}));

// Mock server-only (no-op in tests)
vi.mock("server-only", () => ({}));

// Mock redis before importing the module
vi.mock("@/utils/redis", () => ({
  redis: {
    get: mockGet,
    set: mockSet,
    del: mockDel,
  },
}));

import {
  getWorkflowGroupFromLabel,
  getClaudeCodeSession,
  saveClaudeCodeSession,
  deleteClaudeCodeSession,
  type WorkflowGroup,
  type ClaudeCodeSessionData,
} from "./claude-code-session";

describe("Claude Code Session Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getWorkflowGroupFromLabel", () => {
    it("should map report labels to 'report' workflow group", () => {
      const reportLabels = [
        "email-report-email-behavior",
        "email-report-executive-summary",
        "email-report-user-persona",
        "email-report-response-patterns",
        "email-report-summary-generation",
        "email-report-actionable-recommendations",
        "email-report-label-analysis",
      ];

      for (const label of reportLabels) {
        expect(getWorkflowGroupFromLabel(label)).toBe("report");
      }
    });

    it("should map rules labels to 'rules' workflow group", () => {
      const rulesLabels = [
        "Prompt to rules",
        "Generate rules prompt",
        "Find existing rules",
        "Diff rules",
      ];

      for (const label of rulesLabels) {
        expect(getWorkflowGroupFromLabel(label)).toBe("rules");
      }
    });

    it("should map clean labels to 'clean' workflow group", () => {
      const cleanLabels = ["Clean", "Clean - Select Labels"];

      for (const label of cleanLabels) {
        expect(getWorkflowGroupFromLabel(label)).toBe("clean");
      }
    });

    it("should map unknown labels to 'default' workflow group", () => {
      const unknownLabels = [
        "Summarize email",
        "Meeting Briefing",
        "Writing Style Analysis",
        "Some Unknown Task",
        "",
      ];

      for (const label of unknownLabels) {
        expect(getWorkflowGroupFromLabel(label)).toBe("default");
      }
    });
  });

  describe("getClaudeCodeSession", () => {
    it("should return session data when it exists", async () => {
      const mockSession: ClaudeCodeSessionData = {
        sessionId: "session-abc-123",
        lastUsedAt: "2024-01-15T10:30:00.000Z",
      };
      mockGet.mockResolvedValue(mockSession);

      const result = await getClaudeCodeSession({
        userEmail: "acc-123",
        workflowGroup: "report",
      });

      expect(result).toEqual(mockSession);
      expect(mockGet).toHaveBeenCalledWith("claude-session:acc-123:report");
    });

    it("should return null when session does not exist", async () => {
      mockGet.mockResolvedValue(null);

      const result = await getClaudeCodeSession({
        userEmail: "acc-123",
        workflowGroup: "rules",
      });

      expect(result).toBeNull();
      expect(mockGet).toHaveBeenCalledWith("claude-session:acc-123:rules");
    });

    it("should return null when redis returns undefined", async () => {
      mockGet.mockResolvedValue(undefined);

      const result = await getClaudeCodeSession({
        userEmail: "acc-456",
        workflowGroup: "clean",
      });

      expect(result).toBeNull();
    });

    it("should use correct key format for all workflow groups", async () => {
      mockGet.mockResolvedValue(null);

      const workflowGroups: WorkflowGroup[] = [
        "report",
        "rules",
        "clean",
        "default",
      ];

      for (const group of workflowGroups) {
        await getClaudeCodeSession({
          userEmail: "test-acc",
          workflowGroup: group,
        });
      }

      expect(mockGet).toHaveBeenCalledWith("claude-session:test-acc:report");
      expect(mockGet).toHaveBeenCalledWith("claude-session:test-acc:rules");
      expect(mockGet).toHaveBeenCalledWith("claude-session:test-acc:clean");
      expect(mockGet).toHaveBeenCalledWith("claude-session:test-acc:default");
    });
  });

  describe("saveClaudeCodeSession", () => {
    it("should save session with correct key and TTL", async () => {
      mockSet.mockResolvedValue("OK");

      await saveClaudeCodeSession({
        userEmail: "acc-123",
        workflowGroup: "report",
        sessionId: "session-xyz-789",
      });

      expect(mockSet).toHaveBeenCalledTimes(1);
      const [key, data, options] = mockSet.mock.calls[0];

      expect(key).toBe("claude-session:acc-123:report");
      expect(data.sessionId).toBe("session-xyz-789");
      expect(data.lastUsedAt).toBeDefined();
      expect(options).toEqual({ ex: 1800 }); // 30 minutes in seconds
    });

    it("should include ISO timestamp in lastUsedAt", async () => {
      mockSet.mockResolvedValue("OK");

      await saveClaudeCodeSession({
        userEmail: "acc-123",
        workflowGroup: "rules",
        sessionId: "session-123",
      });

      const [, data] = mockSet.mock.calls[0];
      // Validate ISO format
      expect(() => new Date(data.lastUsedAt)).not.toThrow();
      expect(new Date(data.lastUsedAt).toISOString()).toBe(data.lastUsedAt);
    });

    it("should use correct key format for different workflow groups", async () => {
      mockSet.mockResolvedValue("OK");

      await saveClaudeCodeSession({
        userEmail: "acc-789",
        workflowGroup: "clean",
        sessionId: "session-clean",
      });

      expect(mockSet.mock.calls[0][0]).toBe("claude-session:acc-789:clean");

      await saveClaudeCodeSession({
        userEmail: "acc-789",
        workflowGroup: "default",
        sessionId: "session-default",
      });

      expect(mockSet.mock.calls[1][0]).toBe("claude-session:acc-789:default");
    });
  });

  describe("deleteClaudeCodeSession", () => {
    it("should delete session with correct key", async () => {
      mockDel.mockResolvedValue(1);

      await deleteClaudeCodeSession({
        userEmail: "acc-123",
        workflowGroup: "report",
      });

      expect(mockDel).toHaveBeenCalledWith("claude-session:acc-123:report");
    });

    it("should not throw when session does not exist", async () => {
      mockDel.mockResolvedValue(0);

      await expect(
        deleteClaudeCodeSession({
          userEmail: "nonexistent",
          workflowGroup: "rules",
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("Redis key format", () => {
    it("should handle special characters in userEmail", async () => {
      mockGet.mockResolvedValue(null);

      await getClaudeCodeSession({
        userEmail: "user@example.com",
        workflowGroup: "report",
      });

      // The key should be constructed as-is; Redis handles special chars
      expect(mockGet).toHaveBeenCalledWith(
        "claude-session:user@example.com:report",
      );
    });
  });

  describe("Error propagation", () => {
    it("should propagate Redis get errors to caller", async () => {
      const redisError = new Error("Redis connection failed");
      mockGet.mockRejectedValue(redisError);

      await expect(
        getClaudeCodeSession({
          userEmail: "acc-123",
          workflowGroup: "report",
        }),
      ).rejects.toThrow("Redis connection failed");
    });

    it("should propagate Redis set errors to caller", async () => {
      const redisError = new Error("Redis write failed");
      mockSet.mockRejectedValue(redisError);

      await expect(
        saveClaudeCodeSession({
          userEmail: "acc-123",
          workflowGroup: "report",
          sessionId: "session-123",
        }),
      ).rejects.toThrow("Redis write failed");
    });

    it("should propagate Redis del errors to caller", async () => {
      const redisError = new Error("Redis delete failed");
      mockDel.mockRejectedValue(redisError);

      await expect(
        deleteClaudeCodeSession({
          userEmail: "acc-123",
          workflowGroup: "report",
        }),
      ).rejects.toThrow("Redis delete failed");
    });
  });
});
