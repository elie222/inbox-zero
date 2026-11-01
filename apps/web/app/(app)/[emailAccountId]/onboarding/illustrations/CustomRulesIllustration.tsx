"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpIcon } from "lucide-react";
import { Badge } from "@/components/Badge";
import { getActionColor } from "@/components/PlanBadge";
import { IllustrationWindow } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/IllustrationWindow";
import { ActionType } from "@/generated/prisma/enums";
import { getActionIcon } from "@/utils/action-display";

const rules = [
  {
    instruction: "Forward receipts and invoices to my accountant",
    actions: [
      { type: ActionType.LABEL, text: "Receipt" },
      { type: ActionType.FORWARD, text: "accountant@example.com" },
    ],
  },
  {
    instruction: "Label newsletters and archive them after a week",
    actions: [
      { type: ActionType.LABEL, text: "Newsletter" },
      { type: ActionType.ARCHIVE, text: "Archive after 7 days" },
    ],
  },
  {
    instruction: "Draft replies to customer questions using our help docs",
    actions: [
      { type: ActionType.LABEL, text: "Support" },
      { type: ActionType.DRAFT_EMAIL, text: "Draft reply" },
    ],
  },
  {
    instruction: "Let me know in Slack when an investor emails",
    actions: [
      { type: ActionType.LABEL, text: "Investors" },
      { type: ActionType.NOTIFY_MESSAGING_CHANNEL, text: "Notify in Slack" },
    ],
  },
];

export function CustomRulesIllustration() {
  const reduceMotion = useReducedMotion();
  const enter = reduceMotion ? false : { opacity: 0, y: 8 };

  return (
    <IllustrationWindow className="w-full max-w-[600px]">
      <div className="space-y-2.5 bg-muted/40 p-5">
        {rules.map((rule, index) => (
          <motion.div
            key={rule.instruction}
            initial={enter}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.12 }}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <p className="text-sm font-medium text-foreground">
              {rule.instruction}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {rule.actions.map((action) => {
                const Icon = getActionIcon(action.type);
                return (
                  <Badge key={action.text} color={getActionColor(action.type)}>
                    <Icon className="mr-1.5 size-3" />
                    {action.text}
                  </Badge>
                );
              })}
            </div>
          </motion.div>
        ))}

        <motion.div
          initial={enter}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: rules.length * 0.12 }}
          className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card py-2.5 pr-2.5 pl-4"
        >
          <span className="flex-1 truncate text-sm text-muted-foreground">
            Archive shipping updates once they're delivered
          </span>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ArrowUpIcon className="size-4" />
          </span>
        </motion.div>
      </div>
    </IllustrationWindow>
  );
}
