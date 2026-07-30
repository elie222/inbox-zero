"use client";

import { useState } from "react";
import { capitalCase } from "capital-case";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Badge } from "@/components/Badge";
import type { Thread } from "@/components/email-list/types";
import { PlanBadge, getActionColor } from "@/components/PlanBadge";
import { getActionFields } from "@/utils/action-item";

// One-line summary of what the AI did to this thread; click to expand the
// rule's criteria and the full action details.
export function PlanExplanation(props: { provider: string; thread: Thread }) {
  const { provider, thread } = props;
  const [expanded, setExpanded] = useState(false);

  if (!thread) return null;
  const { plan } = thread;
  if (!plan?.rule) return null;

  const summary = (plan.actionItems ?? [])
    .map((action) => {
      const fields = getActionFields(action) as Record<string, string>;
      const detail = fields.label ?? fields.to ?? null;
      return detail
        ? `${capitalCase(action.type)}: ${detail}`
        : capitalCase(action.type);
    })
    .join(" · ");

  return (
    <div className="border-b border-b-muted bg-gradient-to-r from-purple-50 via-blue-50 to-green-50 text-primary">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2 text-left"
        aria-expanded={expanded}
        onClick={() => setExpanded((previous) => !previous)}
      >
        {/* min-w-0, not shrink-0: a long rule name must truncate inside
            the badge rather than push the summary off a phone */}
        <span className="min-w-0">
          <PlanBadge plan={plan} provider={provider} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{summary}</span>
        {expanded ? (
          <ChevronUpIcon className="size-4 shrink-0" />
        ) : (
          <ChevronDownIcon className="size-4 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="max-h-48 overflow-auto px-4 pb-4">
          {plan.rule?.instructions && (
            <div className="text-sm">{plan.rule.instructions}</div>
          )}
          <div className="mt-3 space-y-2">
            {plan.actionItems?.map((action, i) => (
              <div key={i}>
                <Badge color={getActionColor(action.type)}>
                  {capitalCase(action.type)}
                </Badge>

                <div className="mt-1">
                  {Object.entries(getActionFields(action)).map(
                    ([key, value]) => (
                      <div key={key}>
                        <strong>{capitalCase(key)}: </strong>
                        <span className="whitespace-pre-wrap">
                          {value as string}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
