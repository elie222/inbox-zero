import { posthogCaptureEvent } from "@/utils/posthog";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("rule-events");

/**
 * How users change their rules. Properties are only ids, enums and
 * counts: never rule names, instructions or senders.
 *
 * `Rule changed`: a rule was created, edited, enabled or disabled through the
 * rule editor, chat, API or MCP. Bulk copy and import between accounts are not
 * tracked, matching `RuleHistory`.
 * - `ruleId`, `systemType` (null for custom rules), `enabled`.
 * - `triggerType`: same values as `RuleHistory.triggerType`.
 *
 * `Rule deleted`: `ruleId`.
 *
 * `All rules toggled`: the rules-wide switch. `enabled`.
 */
export const RULE_ANALYTICS_EVENTS = {
  ruleChanged: "Rule changed",
  ruleDeleted: "Rule deleted",
  allRulesToggled: "All rules toggled",
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
