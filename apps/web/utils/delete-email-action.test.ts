import { describe, expect, it, vi } from "vitest";
import { ActionType } from "@/generated/prisma/enums";
import {
  DELETE_EMAIL_ACTION_DISABLED_MESSAGE,
  ensureDeleteEmailActionEnabled,
  hasDeleteEmailAction,
  isDeleteEmailActionEnabled,
} from "./delete-email-action";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    deleteEmailActionEnabled: false,
  },
}));

vi.mock("@/env", () => ({
  env: {
    get NEXT_PUBLIC_DELETE_EMAIL_ACTION_ENABLED() {
      return mockEnv.deleteEmailActionEnabled;
    },
  },
}));

describe("delete-email-action", () => {
  it("is disabled by default", () => {
    mockEnv.deleteEmailActionEnabled = false;
    expect(isDeleteEmailActionEnabled()).toBe(false);
  });

  it("is enabled when the env flag is true", () => {
    mockEnv.deleteEmailActionEnabled = true;
    expect(isDeleteEmailActionEnabled()).toBe(true);
  });

  it("detects delete actions in a rule", () => {
    expect(hasDeleteEmailAction([{ type: ActionType.ARCHIVE }])).toBe(false);
    expect(hasDeleteEmailAction([{ type: ActionType.DELETE }])).toBe(true);
  });

  it("throws when delete actions are disabled", () => {
    mockEnv.deleteEmailActionEnabled = false;
    expect(() => ensureDeleteEmailActionEnabled()).toThrow(
      DELETE_EMAIL_ACTION_DISABLED_MESSAGE,
    );
  });

  it("allows delete actions when enabled", () => {
    mockEnv.deleteEmailActionEnabled = true;
    expect(() => ensureDeleteEmailActionEnabled()).not.toThrow();
  });
});
