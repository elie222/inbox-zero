import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAiSensitiveContentPolicyDefault,
  isAiSensitiveContentPolicyLocked,
  resolveAiSensitiveContentPolicy,
} from "@/utils/dlp/policy.server";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    AI_SENSITIVE_CONTENT_POLICY_DEFAULT: undefined as string | undefined,
    AI_SENSITIVE_CONTENT_POLICY_LOCKED: false,
  },
}));

vi.mock("@/env", () => ({
  env: mockEnv,
}));

describe("AI sensitive content policy resolution", () => {
  beforeEach(() => {
    mockEnv.AI_SENSITIVE_CONTENT_POLICY_DEFAULT = undefined;
    mockEnv.AI_SENSITIVE_CONTENT_POLICY_LOCKED = false;
  });

  it("uses the account policy when policy is not locked", () => {
    expect(resolveAiSensitiveContentPolicy("REDACT")).toBe("REDACT");
  });

  it("uses the deployment default when no account policy is set", () => {
    mockEnv.AI_SENSITIVE_CONTENT_POLICY_DEFAULT = "BLOCK";

    expect(resolveAiSensitiveContentPolicy(null)).toBe("BLOCK");
    expect(getAiSensitiveContentPolicyDefault()).toBe("BLOCK");
  });

  it("uses the deployment default when locked", () => {
    mockEnv.AI_SENSITIVE_CONTENT_POLICY_DEFAULT = "BLOCK";
    mockEnv.AI_SENSITIVE_CONTENT_POLICY_LOCKED = true;

    expect(resolveAiSensitiveContentPolicy("ALLOW")).toBe("BLOCK");
    expect(isAiSensitiveContentPolicyLocked()).toBe(true);
  });
});
