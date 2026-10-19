import { describe, expect, it } from "vitest";
import {
  getOnboardingStepHref,
  getOnboardingStepIndex,
  getVisibleOnboardingStepKeys,
  isDraftRepliesDisabledByRuleState,
  STEP_KEYS,
} from "./onboardingFlow";
import { ActionType, SystemType } from "@/generated/prisma/enums";

describe("getVisibleOnboardingStepKeys", () => {
  it("asks the survey and intent first, then the AI flow before an intent is chosen", () => {
    expect(
      getVisibleOnboardingStepKeys({
        canInviteTeam: true,
        autoDraftDisabled: false,
        signupIntent: null,
      }),
    ).toEqual([
      STEP_KEYS.WHO,
      STEP_KEYS.COMPANY_SIZE,
      STEP_KEYS.HOW_YOU_HEARD,
      STEP_KEYS.INTENT,
      STEP_KEYS.EMAILS_SORTED,
      STEP_KEYS.CHAT,
      STEP_KEYS.DRAFT_REPLIES,
      STEP_KEYS.BULK_UNSUBSCRIBE,
      STEP_KEYS.LABELS,
      STEP_KEYS.DRAFT,
      STEP_KEYS.CUSTOM_RULES,
      STEP_KEYS.INVITE_TEAM,
      STEP_KEYS.INBOX_PROCESSED,
    ]);
  });

  it.each([
    "AI_ASSISTANT",
    "BOTH",
  ] as const)("continues into the AI flow for %s", (signupIntent) => {
    const stepKeys = getVisibleOnboardingStepKeys({
      canInviteTeam: true,
      autoDraftDisabled: false,
      signupIntent,
    });
    expect(stepKeys[stepKeys.indexOf(STEP_KEYS.INTENT) + 1]).toBe(
      STEP_KEYS.EMAILS_SORTED,
    );
    expect(stepKeys).not.toContain(STEP_KEYS.MAIL_APP);
  });

  it("sends email-app users to the mail app step instead of AI setup", () => {
    expect(
      getVisibleOnboardingStepKeys({
        canInviteTeam: true,
        autoDraftDisabled: false,
        signupIntent: "MAIL_CLIENT",
      }),
    ).toEqual([
      STEP_KEYS.WHO,
      STEP_KEYS.COMPANY_SIZE,
      STEP_KEYS.HOW_YOU_HEARD,
      STEP_KEYS.INTENT,
      STEP_KEYS.MAIL_APP,
    ]);
  });

  it("filters steps that are not available in the current context", () => {
    expect(
      getVisibleOnboardingStepKeys({
        canInviteTeam: false,
        autoDraftDisabled: true,
        signupIntent: "AI_ASSISTANT",
      }),
    ).toEqual([
      STEP_KEYS.WHO,
      STEP_KEYS.COMPANY_SIZE,
      STEP_KEYS.HOW_YOU_HEARD,
      STEP_KEYS.INTENT,
      STEP_KEYS.EMAILS_SORTED,
      STEP_KEYS.CHAT,
      STEP_KEYS.BULK_UNSUBSCRIBE,
      STEP_KEYS.LABELS,
      STEP_KEYS.CUSTOM_RULES,
      STEP_KEYS.INBOX_PROCESSED,
    ]);
  });

  it("starts self-hosted deployments at the intent step", () => {
    expect(
      getVisibleOnboardingStepKeys({
        canInviteTeam: true,
        autoDraftDisabled: false,
        isSelfHosted: true,
        signupIntent: null,
      })[0],
    ).toBe(STEP_KEYS.INTENT);
  });
});

describe("getOnboardingStepIndex", () => {
  const stepKeys = getVisibleOnboardingStepKeys({
    canInviteTeam: false,
    autoDraftDisabled: false,
    signupIntent: null,
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

describe("isDraftRepliesDisabledByRuleState", () => {
  it("does not disable draft steps before the reply rule exists", () => {
    expect(isDraftRepliesDisabledByRuleState([])).toBe(false);
  });

  it("disables draft steps when the reply rule has no draft action", () => {
    expect(
      isDraftRepliesDisabledByRuleState([
        {
          systemType: SystemType.TO_REPLY,
          actions: [{ type: ActionType.LABEL }],
        },
      ]),
    ).toBe(true);
  });

  it("keeps draft steps when the reply rule has a draft action", () => {
    expect(
      isDraftRepliesDisabledByRuleState([
        {
          systemType: SystemType.TO_REPLY,
          actions: [
            { type: ActionType.LABEL },
            { type: ActionType.DRAFT_EMAIL },
          ],
        },
      ]),
    ).toBe(false);
  });
});
