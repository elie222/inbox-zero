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
  label?: string;
  archive?: string;
  notify?: string;
  draft?: string;
  markread?: string;
  children?: ReactNode;
};

type SuggestedAction = {
  type: ActionType;
  label?: string | null;
  notificationDestination?: string | null;
};

export function InlineRuleSuggestions({ children }: { children?: ReactNode }) {
  return <div className="my-3 grid gap-2">{children}</div>;
}

export function InlineRuleSuggestionCard({
  name,
  when,
  do: action,
  label,
  archive,
  notify,
  draft,
  markread,
  children,
}: InlineRuleSuggestionCardProps) {
  const { submitTextMessage } = useChat();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const title = normalizeTagAttribute(name) || "Suggested rule";
  const whenText = normalizeTagAttribute(when);
  const actionText = normalizeTagAttribute(action);
  const summary = nodeToText(children).trim();
  const suggestedActions = buildSuggestedActions({
    label,
    archive,
    notify,
    draft,
    markread,
  });
  const actionInstruction = [
    getSuggestedActionInstruction(suggestedActions),
    actionText,
  ]
    .filter(Boolean)
    .join(", ");

  async function handleApproveRule() {
    setIsSubmitting(true);
    try {
      await submitTextMessage(
        [
          `Create this suggested rule: ${title}`,
          whenText ? `It should catch: ${whenText}` : null,
          actionInstruction ? `It should do: ${actionInstruction}` : null,
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

      {(actionText || suggestedActions.length > 0) && (
        <RuleSummaryRow label="Then">
          <div className="flex flex-wrap items-center gap-1.5">
            {suggestedActions.length > 0 && (
              <SuggestedActionBadgeList actions={suggestedActions} />
            )}
            {actionText && <span>{actionText}</span>}
          </div>
        </RuleSummaryRow>
      )}
    </RuleSummaryCard>
  );
}

function SuggestedActionBadgeList({ actions }: { actions: SuggestedAction[] }) {
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

function buildSuggestedActions({
  label,
  archive,
  notify,
  draft,
  markread,
}: Pick<
  InlineRuleSuggestionCardProps,
  "label" | "archive" | "notify" | "draft" | "markread"
>) {
  const actions: SuggestedAction[] = [];
  const labelText = normalizeTagAttribute(label);
  const notificationDestination = normalizeTagAttribute(notify);

  if (labelText) actions.push({ type: ActionType.LABEL, label: labelText });
  if (isEnabledAttribute(archive)) actions.push({ type: ActionType.ARCHIVE });
  if (isEnabledAttribute(draft)) actions.push({ type: ActionType.DRAFT_EMAIL });
  if (notificationDestination) {
    actions.push({
      type: ActionType.NOTIFY_MESSAGING_CHANNEL,
      notificationDestination,
    });
  }
  if (isEnabledAttribute(markread)) {
    actions.push({ type: ActionType.MARK_READ });
  }

  return actions;
}

function getSuggestedActionInstruction(actions: SuggestedAction[]) {
  return actions
    .map((action) =>
      getActionDisplay(
        {
          type: action.type,
          label: action.label,
          notificationDestination: action.notificationDestination,
        },
        "",
        [],
      ),
    )
    .join(", ");
}

function isEnabledAttribute(value: string | undefined) {
  return normalizeTagAttribute(value) === "true";
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
