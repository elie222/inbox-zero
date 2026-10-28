import { posthogCaptureEvent } from "@/utils/posthog";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("rule-events");

/**
 * How users shape and correct their rules. Properties are only ids, enums and
 * counts: never rule names, instructions or senders.
 *
 * `Rule changed`: a rule was created, edited, enabled or disabled.
 * - `ruleId`, `systemType` (null for custom rules), `enabled`.
 * - `triggerType`: same values as `RuleHistory.triggerType`.
 * - `learnedPatternsCleared`: AI-learned sender patterns the change reset.
 *
 * `Rule deleted`: `ruleId`.
 *
 * `All rules toggled`: the rules-wide switch. `enabled`.
 *
 * `Rule label removed by user`: the user took one of our rule labels (Gmail) or
 * folders (Outlook) off an email we sorted. Conversation status labels are left
 * out because we move those ourselves. `ruleId`, `systemType`.
 */
export const RULE_ANALYTICS_EVENTS = {
  ruleChanged: "Rule changed",
  ruleDeleted: "Rule deleted",
  allRulesToggled: "All rules toggled",
  ruleLabelRemovedByUser: "Rule label removed by user",
} as const;

type RuleAnalyticsEvent =
  (typeof RULE_ANALYTICS_EVENTS)[keyof typeof RULE_ANALYTICS_EVENTS];

/**
 * Uses User.email as distinctId (not EmailAccount.email) so the event attaches
 * to the same PostHog person as signup/billing events.
 */
export async function trackRuleEvent({
  emailAccountId,
  event,
  properties,
}: {
  emailAccountId: string;
  event: RuleAnalyticsEvent;
  properties: Record<string, string | number | boolean | null>;
}) {
  try {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { user: { select: { email: true } } },
    });
    const userEmail = emailAccount?.user?.email;
    if (!userEmail) return;

    await posthogCaptureEvent(userEmail, event, {
      emailAccountId,
      ...properties,
    });
  } catch (error) {
    logger.error("Error tracking rule event", { error, event });
  }
}
