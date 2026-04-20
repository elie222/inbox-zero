import { describe, expect, it, vi } from "vitest";
import { env } from "@/env";
import { ActionType, SystemType } from "@/generated/prisma/enums";
import { getRuleActionTypeOptions } from "./RuleForm";

vi.mock("server-only", () => ({}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: true,
    NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED: true,
    NEXT_PUBLIC_IS_RESEND_CONFIGURED: true,
    EMAIL_ENCRYPT_SECRET: "test-secret",
    EMAIL_ENCRYPT_SALT: "test-salt",
  },
}));

describe("getRuleActionTypeOptions", () => {
  it("keeps move to folder available for existing rules before provider data loads", () => {
    const options = getRuleActionTypeOptions({
      provider: "",
      labelActionText: "Label",
      hasConnectedMessagingChannels: false,
      hasAvailableMessagingProviders: false,
      systemType: null,
      existingActionTypes: [ActionType.MOVE_FOLDER],
    });

    expect(
      options.some((option) => option.value === ActionType.MOVE_FOLDER),
    ).toBe(true);
  });

  it("keeps chat delivery actions available for existing rules without a connected provider", () => {
    const options = getRuleActionTypeOptions({
      provider: "",
      labelActionText: "Label",
      hasConnectedMessagingChannels: false,
      hasAvailableMessagingProviders: false,
      systemType: null,
      existingActionTypes: [ActionType.NOTIFY_MESSAGING_CHANNEL],
    });

    expect(
      options.some(
        (option) => option.value === ActionType.NOTIFY_MESSAGING_CHANNEL,
      ),
    ).toBe(true);
  });

  it("only exposes notify sender for configured cold email rules or existing actions", () => {
    const noExistingActionOptions = getRuleActionTypeOptions({
      provider: "",
      labelActionText: "Label",
      hasConnectedMessagingChannels: false,
      hasAvailableMessagingProviders: false,
      systemType: null,
      existingActionTypes: [],
    });
    const coldEmailOptions = getRuleActionTypeOptions({
      provider: "",
      labelActionText: "Label",
      hasConnectedMessagingChannels: false,
      hasAvailableMessagingProviders: false,
      systemType: SystemType.COLD_EMAIL,
      existingActionTypes: [],
    });

    expect(
      noExistingActionOptions.some(
        (option) => option.value === ActionType.NOTIFY_SENDER,
      ),
    ).toBe(false);
    expect(
      coldEmailOptions.some(
        (option) => option.value === ActionType.NOTIFY_SENDER,
      ),
    ).toBe(true);
    expect(env.NEXT_PUBLIC_IS_RESEND_CONFIGURED).toBe(true);
  });
});
