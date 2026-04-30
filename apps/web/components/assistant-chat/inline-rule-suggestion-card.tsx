"use client";

import {
  Children,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/ui/button";
import {
  RuleSummaryCard,
  RuleSummaryRow,
} from "@/components/assistant-chat/rule-summary-card";
import { getActionDisplay, getActionIcon } from "@/utils/action-display";
import { getActionColor } from "@/components/PlanBadge";
import { ActionType } from "@/generated/prisma/enums";
import { useChat } from "@/providers/ChatProvider";

type InlineRuleSuggestionCardProps = {
  name?: string;
  when?: string;
  do?: string;
  children?: ReactNode;
};

export function InlineRuleSuggestions({ children }: { children?: ReactNode }) {
  return <div className="my-3 grid gap-2">{children}</div>;
}

export function InlineRuleSuggestionCard({
  name,
  when,
  do: action,
  children,
}: InlineRuleSuggestionCardProps) {
  const { submitTextMessage } = useChat();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const title = normalizeTagAttribute(name) || "Suggested rule";
  const whenText = normalizeTagAttribute(when);
  const actionText = normalizeTagAttribute(action);
  const summary = nodeToText(children).trim();
  const suggestedActions = buildSuggestedActions(actionText);

  async function handleApproveRule() {
    setIsSubmitting(true);
    try {
      await submitTextMessage(
        [
          `Create this suggested rule: ${title}`,
          whenText ? `It should catch: ${whenText}` : null,
          actionText ? `It should do: ${actionText}` : null,
          summary ? `Context: ${summary}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <RuleSummaryCard
      title={title}
      actions={
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0 gap-1.5"
          disabled={isSubmitting}
          onClick={handleApproveRule}
        >
          {isSubmitting ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <CheckIcon className="size-3.5" />
          )}
          Approve
        </Button>
      }
    >
      {whenText && <RuleSummaryRow label="When">{whenText}</RuleSummaryRow>}

      {actionText && (
        <RuleSummaryRow label="Then">
          {suggestedActions.length > 0 ? (
            <SuggestedActionBadgeList actions={suggestedActions} />
          ) : (
            actionText
          )}
        </RuleSummaryRow>
      )}
    </RuleSummaryCard>
  );
}

function SuggestedActionBadgeList({
  actions,
}: {
  actions: Array<{
    type: ActionType;
    label?: string | null;
    notificationDestination?: string | null;
  }>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.map((action, index) => {
        const Icon = getActionIcon(action.type);

        return (
          <Badge
            key={`${action.type}-${action.label ?? index}`}
            color={getActionColor(action.type)}
            className="w-fit shrink-0"
          >
            <Icon className="mr-1.5 size-3" />
            {getActionDisplay(
              {
                type: action.type,
                label: action.label,
                notificationDestination: action.notificationDestination,
              },
              "",
              [],
            )}
          </Badge>
        );
      })}
    </div>
  );
}

function buildSuggestedActions(actionText: string) {
  const lowerText = actionText.toLowerCase();
  const actions: Array<{
    type: ActionType;
    label?: string | null;
    notificationDestination?: string | null;
  }> = [];
  const label = findSuggestedLabel(actionText);
  const notificationDestination =
    findSuggestedNotificationDestination(actionText);

  if (label) actions.push({ type: ActionType.LABEL, label });
  if (lowerText.includes("archive")) actions.push({ type: ActionType.ARCHIVE });
  if (lowerText.includes("draft"))
    actions.push({ type: ActionType.DRAFT_EMAIL });
  if (lowerText.includes("notify")) {
    actions.push({
      type: ActionType.NOTIFY_MESSAGING_CHANNEL,
      notificationDestination,
    });
  }
  if (lowerText.includes("mark as read") || lowerText.includes("mark read")) {
    actions.push({ type: ActionType.MARK_READ });
  }

  return actions;
}

function findSuggestedLabel(actionText: string) {
  const match =
    actionText.match(
      /\blabel (?:(?:the )?email as |(?:the )?emails as |as |them |it )?["']?([^"',.]+)["']?/i,
    ) || actionText.match(/\bapply (?:the )?["']?([^"',.]+)["']? label/i);

  return match?.[1]?.split(/\s+and\s+/i)[0]?.trim() || null;
}

function findSuggestedNotificationDestination(actionText: string) {
  const match = actionText.match(/\bnotify(?:\s+\w+)?\s+via\s+([^"',.]+)/i);
  const destination = match?.[1]?.split(/\s+and\s+/i)[0]?.trim();

  if (!destination || isGenericNotificationDestination(destination)) {
    return null;
  }

  if (/slack/i.test(destination)) return "Slack";
  if (/telegram/i.test(destination)) return "Telegram";
  if (/teams/i.test(destination)) return "Teams";

  return destination;
}

function isGenericNotificationDestination(destination: string) {
  return /^(?:your\s+)?(?:chat app|messaging channel|notification channel)$/i.test(
    destination,
  );
}

function normalizeTagAttribute(value: string | undefined) {
  return value?.replace(/^user-content-/, "").trim() || "";
}

function nodeToText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(nodeToText).join("");
  }

  if (isValidElement(node)) {
    return nodeToText(
      (node as ReactElement<{ children?: ReactNode }>).props.children,
    );
  }

  return Children.toArray(node).map(nodeToText).join("");
}
