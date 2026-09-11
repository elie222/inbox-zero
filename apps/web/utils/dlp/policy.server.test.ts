import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSensitiveDataPolicyDefault,
  isSensitiveDataPolicyLocked,
  resolveSensitiveDataPolicy,
} from "@/utils/dlp/policy.server";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    SENSITIVE_DATA_POLICY_DEFAULT: undefined as string | undefined,
    NEXT_PUBLIC_SENSITIVE_DATA_POLICY_LOCKED: false,
  },
}));

vi.mock("@/env", () => ({
  env: mockEnv,
}));

describe("Sensitive data policy resolution", () => {
  beforeEach(() => {
    mockEnv.SENSITIVE_DATA_POLICY_DEFAULT = undefined;
    mockEnv.NEXT_PUBLIC_SENSITIVE_DATA_POLICY_LOCKED = false;
  });

  it("uses the account policy when policy is not locked", () => {
    expect(resolveSensitiveDataPolicy("REDACT")).toBe("REDACT");
  });

  it("uses the deployment default when no account policy is set", () => {
    mockEnv.SENSITIVE_DATA_POLICY_DEFAULT = "BLOCK";

    expect(resolveSensitiveDataPolicy(null)).toBe("BLOCK");
    expect(getSensitiveDataPolicyDefault()).toBe("BLOCK");
  });

  it("uses the deployment default when locked", () => {
    mockEnv.SENSITIVE_DATA_POLICY_DEFAULT = "BLOCK";
    mockEnv.NEXT_PUBLIC_SENSITIVE_DATA_POLICY_LOCKED = true;

    expect(resolveSensitiveDataPolicy("ALLOW")).toBe("BLOCK");
    expect(isSensitiveDataPolicyLocked()).toBe(true);
  });
});
