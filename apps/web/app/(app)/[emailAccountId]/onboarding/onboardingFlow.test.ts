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
  it("introduces the product before asking anything, then sets up the AI", () => {
    expect(
      getVisibleOnboardingStepKeys({
        autoDraftDisabled: false,
        emailAppEnabled: true,
        mailAppEnabled: true,
        signupIntent: null,
      }),
    ).toEqual([
      STEP_KEYS.WELCOME,
      STEP_KEYS.EMAILS_SORTED,
      STEP_KEYS.CHAT,
      STEP_KEYS.DRAFT_REPLIES,
      STEP_KEYS.BULK_UNSUBSCRIBE,
      STEP_KEYS.EMAIL_APP,
      STEP_KEYS.INTENT,
      STEP_KEYS.WHO,
      STEP_KEYS.COMPANY_SIZE,
      STEP_KEYS.HOW_YOU_HEARD,
      STEP_KEYS.LABELS,
      STEP_KEYS.DRAFT,
      STEP_KEYS.CUSTOM_RULES,
      STEP_KEYS.INBOX_PROCESSED,
    ]);
  });

  it.each([
    "AI_ASSISTANT",
    "BOTH",
  ] as const)("continues into the AI setup for %s", (signupIntent) => {
    const stepKeys = getVisibleOnboardingStepKeys({
      autoDraftDisabled: false,
      emailAppEnabled: true,
      mailAppEnabled: true,
      signupIntent,
    });
    expect(stepKeys.at(-1)).toBe(STEP_KEYS.INBOX_PROCESSED);
  });

  it("ends email-app users at the survey, without the AI setup", () => {
    const stepKeys = getVisibleOnboardingStepKeys({
      autoDraftDisabled: false,
      emailAppEnabled: true,
      mailAppEnabled: true,
      signupIntent: "MAIL_CLIENT",
    });
    expect(stepKeys.slice(stepKeys.indexOf(STEP_KEYS.INTENT))).toEqual([
      STEP_KEYS.INTENT,
      STEP_KEYS.WHO,
      STEP_KEYS.COMPANY_SIZE,
      STEP_KEYS.HOW_YOU_HEARD,
    ]);
  });

  it("hides draft steps when auto-drafting is off", () => {
    const stepKeys = getVisibleOnboardingStepKeys({
      autoDraftDisabled: true,
      emailAppEnabled: true,
      mailAppEnabled: true,
      signupIntent: "AI_ASSISTANT",
    });
    expect(stepKeys).not.toContain(STEP_KEYS.DRAFT_REPLIES);
    expect(stepKeys).not.toContain(STEP_KEYS.DRAFT);
  });

  it("hides the email app pitch when sending email is disabled", () => {
    expect(
      getVisibleOnboardingStepKeys({
        autoDraftDisabled: false,
        emailAppEnabled: false,
        mailAppEnabled: true,
        signupIntent: "BOTH",
      }),
    ).not.toContain(STEP_KEYS.EMAIL_APP);
  });

  it("skips the email app and the intent question when the email app is off", () => {
    const stepKeys = getVisibleOnboardingStepKeys({
      autoDraftDisabled: false,
      emailAppEnabled: true,
      mailAppEnabled: false,
      signupIntent: "MAIL_CLIENT",
    });
    expect(stepKeys).not.toContain(STEP_KEYS.EMAIL_APP);
    expect(stepKeys).not.toContain(STEP_KEYS.INTENT);
    expect(stepKeys.at(-1)).toBe(STEP_KEYS.INBOX_PROCESSED);
  });

  it("skips the survey on self-hosted deployments", () => {
    const stepKeys = getVisibleOnboardingStepKeys({
      autoDraftDisabled: false,
      emailAppEnabled: true,
      mailAppEnabled: true,
      isSelfHosted: true,
      signupIntent: "MAIL_CLIENT",
    });
    expect(stepKeys.at(-1)).toBe(STEP_KEYS.INTENT);
    expect(stepKeys).not.toContain(STEP_KEYS.WHO);
  });
});

describe("getOnboardingStepIndex", () => {
  const stepKeys = getVisibleOnboardingStepKeys({
    autoDraftDisabled: false,
    emailAppEnabled: true,
    mailAppEnabled: true,
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

  it("sends the removed team step's numeric link to the final step", () => {
    expect(getOnboardingStepIndex("12", stepKeys)).toBe(
      stepKeys.indexOf(STEP_KEYS.INBOX_PROCESSED),
    );
  });

  it("clamps oversized numeric steps to the last visible step", () => {
    expect(getOnboardingStepIndex("99", stepKeys)).toBe(stepKeys.length - 1);
  });

  it("falls back to the first visible step for unknown keys", () => {
    expect(getOnboardingStepIndex("not-a-real-step", stepKeys)).toBe(0);
  });

  it("falls back to the first visible step for removed step keys", () => {
    expect(getOnboardingStepIndex("inviteTeam", stepKeys)).toBe(0);
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
