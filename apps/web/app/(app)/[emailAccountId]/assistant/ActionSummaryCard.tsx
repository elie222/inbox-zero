import { TagIcon } from "lucide-react";
import type { CreateRuleBody } from "@/utils/actions/rule.validation";
import { ActionType } from "@prisma/client";
import { CardBasic } from "@/components/ui/card";
import {
  ACTION_TYPE_TEXT_COLORS,
  ACTION_TYPE_ICONS,
} from "@/app/(app)/[emailAccountId]/assistant/constants";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import {
  AWAITING_REPLY_LABEL_NAME,
  NEEDS_REPLY_LABEL_NAME,
} from "@/utils/reply-tracker/consts";

export function ActionSummaryCard({
  action,
  typeOptions,
}: {
  action: CreateRuleBody["actions"][number];
  typeOptions: { label: string; value: ActionType }[];
}) {
  const actionTypeLabel =
    typeOptions.find((opt) => opt.value === action.type)?.label || action.type;

  let summaryContent: React.ReactNode = actionTypeLabel;
  let tooltipText: string | undefined;

  switch (action.type) {
    case ActionType.LABEL: {
      const labelValue = action.label?.value || "";
      if (action.label?.ai) {
        summaryContent = labelValue ? `AI Label: ${labelValue}` : "AI Label";
      } else {
        summaryContent = `Label as "${labelValue || "unset"}"`;
      }
      break;
    }

    case ActionType.DRAFT_EMAIL: {
      if (action.content?.setManually) {
        const contentValue = action.content?.value || "";
        summaryContent = (
          <>
            <span>Draft reply</span>
            {action.to?.value && (
              <span className="text-muted-foreground">
                {" "}
                to {action.to.value}
              </span>
            )}
            {contentValue && (
              <>
                <span>:</span>
                <span className="mt-2 block text-muted-foreground">
                  {contentValue}
                </span>
              </>
            )}
            <OptionalEmailFields
              cc={action.cc?.value}
              bcc={action.bcc?.value}
            />
          </>
        );
      } else {
        summaryContent = (
          <>
            <div className="flex items-center gap-2">
              <div>
                <span>AI draft reply</span>
                {action.to?.value && (
                  <span className="text-muted-foreground">
                    {" "}
                    to {action.to.value}
                  </span>
                )}
              </div>
              <TooltipExplanation
                size="md"
                text="Our AI will generate a reply in your tone of voice. It will use your knowledge base and previous conversations with the sender to draft a reply."
              />
            </div>
            <OptionalEmailFields
              cc={action.cc?.value}
              bcc={action.bcc?.value}
            />
          </>
        );
      }
      break;
    }

    case ActionType.REPLY: {
      if (action.content?.setManually) {
        const contentValue = action.content?.value || "";
        summaryContent = (
          <>
            <span>Reply</span>
            {action.to?.value && (
              <span className="text-muted-foreground">
                {" "}
                to {action.to.value}
              </span>
            )}
            {contentValue && (
              <>
                <span>:</span>
                <span className="mt-2 block text-muted-foreground">
                  {contentValue}
                </span>
              </>
            )}
            <OptionalEmailFields
              cc={action.cc?.value}
              bcc={action.bcc?.value}
            />
          </>
        );
      } else {
        summaryContent = (
          <>
            <span>AI reply</span>
            {action.to?.value && (
              <span className="text-muted-foreground">
                {" "}
                to {action.to.value}
              </span>
            )}
            <OptionalEmailFields
              cc={action.cc?.value}
              bcc={action.bcc?.value}
            />
          </>
        );
      }
      break;
    }

    case ActionType.FORWARD:
      summaryContent = (
        <>
          <span>Forward to {action.to?.value || "unset"}</span>
          {action.content?.value && (
            <span className="mt-2 block text-muted-foreground">
              {action.content.value}
            </span>
          )}
          <OptionalEmailFields cc={action.cc?.value} bcc={action.bcc?.value} />
        </>
      );
      break;

    case ActionType.SEND_EMAIL:
      summaryContent = (
        <>
          <span>Send email to {action.to?.value || "unset"}</span>
          {action.subject?.value && (
            <span className="text-muted-foreground">
              {" "}
              - "{action.subject.value}"
            </span>
          )}
          <OptionalEmailFields cc={action.cc?.value} bcc={action.bcc?.value} />
        </>
      );
      break;

    case ActionType.CALL_WEBHOOK:
      summaryContent = `Call webhook: ${action.url?.value || "unset"}`;
      break;

    case ActionType.TRACK_THREAD:
      summaryContent = "Auto-update reply label";
      tooltipText = `Our AI will automatically update the thread label to '${NEEDS_REPLY_LABEL_NAME}' or '${AWAITING_REPLY_LABEL_NAME}' based on whether you need to respond or are awaiting a response from the recipient.`;
      break;

    case ActionType.ARCHIVE:
      summaryContent = "Skip Inbox";
      break;

    case ActionType.MARK_READ:
      summaryContent = "Mark as read";
      break;

    case ActionType.MARK_SPAM:
      summaryContent = "Mark as spam";
      break;

    case ActionType.DIGEST:
      summaryContent = "Add to digest";
      break;

    default:
      summaryContent = actionTypeLabel;
  }

  const Icon = ACTION_TYPE_ICONS[action.type] || TagIcon;
  const textColorClass =
    ACTION_TYPE_TEXT_COLORS[action.type] || "text-gray-500";

  return (
    <CardBasic className="flex items-center justify-between p-4">
      <div className="flex items-center gap-3">
        <Icon className={`size-5 ${textColorClass}`} />
        <div className="whitespace-pre-wrap">{summaryContent}</div>
        {tooltipText && <TooltipExplanation size="md" text={tooltipText} />}
      </div>
    </CardBasic>
  );
}

// Helper component for CC/BCC fields
function EmailField({
  label,
  value,
  className = "mt-1",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <span>{label}:</span>
      <span className="ml-1 text-muted-foreground">{value}</span>
    </div>
  );
}

// Helper component for optional email fields (cc, bcc)
function OptionalEmailFields({
  cc,
  bcc,
}: {
  cc?: string | null;
  bcc?: string | null;
}) {
  if (!cc && !bcc) return null;

  return (
    <div className="mt-3 flex flex-col gap-1">
      {cc && <EmailField label="cc" value={cc} />}
      {bcc && <EmailField label="bcc" value={bcc} />}
    </div>
  );
}
