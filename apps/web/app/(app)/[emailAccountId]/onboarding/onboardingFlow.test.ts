import { describe, expect, it } from "vitest";
import {
  getOnboardingFlowVariant,
  getOnboardingStepHref,
  getOnboardingStepIndex,
  getVisibleOnboardingStepKeys,
  ONBOARDING_FLOW_VARIANTS,
  STEP_KEYS,
} from "./onboardingFlow";

describe("getVisibleOnboardingStepKeys", () => {
  it("returns the full control flow when optional steps are available", () => {
    expect(
      getVisibleOnboardingStepKeys({
        flowVariant: ONBOARDING_FLOW_VARIANTS.CONTROL,
        canInviteTeam: true,
        autoDraftDisabled: false,
      }),
    ).toEqual([
      STEP_KEYS.WELCOME,
      STEP_KEYS.EMAILS_SORTED,
      STEP_KEYS.DRAFT_REPLIES,
      STEP_KEYS.BULK_UNSUBSCRIBE,
      STEP_KEYS.FEATURES,
      STEP_KEYS.WHO,
      STEP_KEYS.COMPANY_SIZE,
      STEP_KEYS.LABELS,
      STEP_KEYS.DRAFT,
      STEP_KEYS.CUSTOM_RULES,
      STEP_KEYS.INVITE_TEAM,
      STEP_KEYS.INBOX_PROCESSED,
    ]);
  });

  it("returns the shortened flow for the experiment variant", () => {
    expect(
      getVisibleOnboardingStepKeys({
        flowVariant: ONBOARDING_FLOW_VARIANTS.FAST_5,
        canInviteTeam: true,
        autoDraftDisabled: false,
      }),
    ).toEqual([
      STEP_KEYS.WHO,
      STEP_KEYS.COMPANY_SIZE,
      STEP_KEYS.LABELS,
      STEP_KEYS.DRAFT,
      STEP_KEYS.INBOX_PROCESSED,
    ]);
  });

  it("filters steps that are not available in the current context", () => {
    expect(
      getVisibleOnboardingStepKeys({
        flowVariant: ONBOARDING_FLOW_VARIANTS.CONTROL,
        canInviteTeam: false,
        autoDraftDisabled: true,
      }),
    ).toEqual([
      STEP_KEYS.WELCOME,
      STEP_KEYS.EMAILS_SORTED,
      STEP_KEYS.BULK_UNSUBSCRIBE,
      STEP_KEYS.FEATURES,
      STEP_KEYS.WHO,
      STEP_KEYS.COMPANY_SIZE,
      STEP_KEYS.LABELS,
      STEP_KEYS.CUSTOM_RULES,
      STEP_KEYS.INBOX_PROCESSED,
    ]);
  });
});

describe("getOnboardingStepIndex", () => {
  const fastFlowKeys = getVisibleOnboardingStepKeys({
    flowVariant: ONBOARDING_FLOW_VARIANTS.FAST_5,
    canInviteTeam: false,
    autoDraftDisabled: false,
  });

  it("resolves descriptive step keys directly", () => {
    expect(getOnboardingStepIndex(STEP_KEYS.LABELS, fastFlowKeys)).toBe(2);
  });

  it("supports legacy numeric step params", () => {
    expect(getOnboardingStepIndex("2", fastFlowKeys)).toBe(1);
  });

  it("clamps oversized numeric steps to the last visible step", () => {
    expect(getOnboardingStepIndex("99", fastFlowKeys)).toBe(4);
  });

  it("falls back to the first visible fast-flow step for removed steps", () => {
    expect(getOnboardingStepIndex(STEP_KEYS.WELCOME, fastFlowKeys)).toBe(0);
  });
});

describe("getOnboardingFlowVariant", () => {
  it("returns a supported variant from the URL param", () => {
    expect(getOnboardingFlowVariant("fast-5")).toBe(
      ONBOARDING_FLOW_VARIANTS.FAST_5,
    );
  });

  it("ignores unknown variants", () => {
    expect(getOnboardingFlowVariant("test")).toBeUndefined();
  });
});

describe("getOnboardingStepHref", () => {
  it("builds a labels step URL with optional params", () => {
    expect(
      getOnboardingStepHref("acc_123", STEP_KEYS.LABELS, {
        force: true,
        variant: ONBOARDING_FLOW_VARIANTS.FAST_5,
      }),
    ).toBe("/acc_123/onboarding?step=labels&force=true&variant=fast-5");
  });
});
