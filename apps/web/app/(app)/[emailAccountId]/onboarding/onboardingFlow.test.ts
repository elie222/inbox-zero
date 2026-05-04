import { describe, expect, it } from "vitest";
import {
  getOnboardingStepHref,
  getOnboardingStepIndex,
  getVisibleOnboardingStepKeys,
  STEP_KEYS,
} from "./onboardingFlow";

describe("getVisibleOnboardingStepKeys", () => {
  it("returns the full onboarding flow when optional steps are available", () => {
    expect(
      getVisibleOnboardingStepKeys({
        canInviteTeam: true,
        autoDraftDisabled: false,
      }),
    ).toEqual([
      STEP_KEYS.EMAILS_SORTED,
      STEP_KEYS.CHAT,
      STEP_KEYS.DRAFT_REPLIES,
      STEP_KEYS.BULK_UNSUBSCRIBE,
      STEP_KEYS.WHO,
      STEP_KEYS.COMPANY_SIZE,
      STEP_KEYS.HOW_YOU_HEARD,
      STEP_KEYS.LABELS,
      STEP_KEYS.DRAFT,
      STEP_KEYS.CUSTOM_RULES,
      STEP_KEYS.INVITE_TEAM,
      STEP_KEYS.INBOX_PROCESSED,
    ]);
  });

  it("filters steps that are not available in the current context", () => {
    expect(
      getVisibleOnboardingStepKeys({
        canInviteTeam: false,
        autoDraftDisabled: true,
      }),
    ).toEqual([
      STEP_KEYS.EMAILS_SORTED,
      STEP_KEYS.CHAT,
      STEP_KEYS.BULK_UNSUBSCRIBE,
      STEP_KEYS.WHO,
      STEP_KEYS.COMPANY_SIZE,
      STEP_KEYS.HOW_YOU_HEARD,
      STEP_KEYS.LABELS,
      STEP_KEYS.CUSTOM_RULES,
      STEP_KEYS.INBOX_PROCESSED,
    ]);
  });
});

describe("getOnboardingStepIndex", () => {
  const stepKeys = getVisibleOnboardingStepKeys({
    canInviteTeam: false,
    autoDraftDisabled: false,
  });

  it("resolves descriptive step keys directly", () => {
    expect(getOnboardingStepIndex(STEP_KEYS.LABELS, stepKeys)).toBe(
      stepKeys.indexOf(STEP_KEYS.LABELS),
    );
  });

  it("supports legacy numeric step params", () => {
    expect(getOnboardingStepIndex("2", stepKeys)).toBe(
      stepKeys.indexOf(STEP_KEYS.EMAILS_SORTED),
    );
  });

  it("keeps legacy numeric step params aligned after removed steps", () => {
    expect(getOnboardingStepIndex("3", stepKeys)).toBe(
      stepKeys.indexOf(STEP_KEYS.CHAT),
    );
  });

  it("clamps oversized numeric steps to the last visible step", () => {
    expect(getOnboardingStepIndex("99", stepKeys)).toBe(stepKeys.length - 1);
  });

  it("falls back to the first visible step for unknown keys", () => {
    expect(getOnboardingStepIndex("not-a-real-step", stepKeys)).toBe(0);
  });

  it("falls back to the first visible step for removed step keys", () => {
    expect(getOnboardingStepIndex("welcome", stepKeys)).toBe(0);
  });
});

describe("getOnboardingStepHref", () => {
  it("builds a labels step URL", () => {
    expect(getOnboardingStepHref("acc_123", STEP_KEYS.LABELS)).toBe(
      "/acc_123/onboarding?step=labels",
    );
  });

  it("includes the force flag when requested", () => {
    expect(
      getOnboardingStepHref("acc_123", STEP_KEYS.LABELS, { force: true }),
    ).toBe("/acc_123/onboarding?step=labels&force=true");
  });
});
