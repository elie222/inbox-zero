"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/providers/EmailAccountProvider";
import { PendingApprovalCard } from "./pending-approvals";

export function BasicToolInfo({ text }: { text: string }) {
  return <ToolCard label={text} />;
}

export function SearchEmailsResult({
  output,
}: {
  output: {
    query?: string;
    count?: number;
    messages?: Array<{
      id: string;
      subject: string;
      from: string;
      date: string;
      snippet: string;
    }>;
  };
}) {
  return (
    <ToolCard
      label={`Searched: ${output.query || "-"} (${output.count ?? 0} results)`}
    >
      <div className="space-y-2">
        {(output.messages || []).slice(0, 5).map((message) => (
          <div key={message.id} className="rounded-md bg-muted p-2 text-sm">
            <div className="font-medium">{message.subject}</div>
            <div className="text-xs text-muted-foreground">
              {message.from} · {message.date}
            </div>
            <div className="text-xs">{message.snippet}</div>
          </div>
        ))}
      </div>
    </ToolCard>
  );
}

export function GetEmailResult({
  output,
}: {
  output: {
    email?: {
      from: string;
      subject: string;
      content: string;
    };
  };
}) {
  return (
    <ToolCard label={`Loaded email: ${output.email?.subject || "-"}`}>
      <div className="rounded-md bg-muted p-2 text-sm">
        <div className="font-medium">{output.email?.subject || "-"}</div>
        <div className="text-xs text-muted-foreground">
          {output.email?.from || "-"}
        </div>
        <div className="mt-2 whitespace-pre-wrap">
          {output.email?.content || "-"}
        </div>
      </div>
    </ToolCard>
  );
}

export function ModifyEmailsResult({
  output,
}: {
  output: {
    results?: Array<{
      action: { type: string };
      result?: {
        success?: boolean;
        requiresApproval?: boolean;
        approvalId?: string;
        reason?: string;
        error?: string;
      };
    }>;
  };
}) {
  const count = output.results?.length ?? 0;
  return (
    <ToolCard label={`Email actions (${count})`}>
      <div className="space-y-2">
        {(output.results || []).map((item, index) => (
          <div key={index} className="rounded-md bg-muted p-2 text-sm">
            <div className="font-medium">{item.action.type}</div>
            <div className="text-xs text-muted-foreground">
              {formatExecutionResult(item.result)}
            </div>
          </div>
        ))}
      </div>
    </ToolCard>
  );
}

export function DraftReplyResult({
  output,
}: {
  output: {
    result?: {
      success?: boolean;
      draftId?: string;
      error?: string;
    };
  };
}) {
  const summary = output.result?.success
    ? "Draft created"
    : output.result?.error || "Draft failed";

  return <ToolCard label={summary} />;
}

export function SendEmailResult({
  output,
}: {
  output: {
    result?: {
      success?: boolean;
      requiresApproval?: boolean;
      approvalId?: string;
      error?: string;
    };
  };
}) {
  const approvalId = output.result?.approvalId;

  if (output.result?.requiresApproval && approvalId) {
    return <PendingApprovalCard approvalId={approvalId} label="Send email" />;
  }

  const summary = output.result?.success
    ? "Email sent"
    : output.result?.error || "Send failed";

  return <ToolCard label={summary} />;
}

export function UpdateSettingsResult({
  output,
}: {
  output: {
    result?: {
      success?: boolean;
      requiresApproval?: boolean;
      approvalId?: string;
      error?: string;
    };
  };
}) {
  const approvalId = output.result?.approvalId;

  if (output.result?.requiresApproval && approvalId) {
    return (
      <PendingApprovalCard approvalId={approvalId} label="Update settings" />
    );
  }

  const summary = output.result?.success
    ? "Settings updated"
    : output.result?.error || "Update failed";

  return <ToolCard label={summary} />;
}

export function PatternResult({ text }: { text: string }) {
  return <ToolCard label={text} />;
}

export function OnboardingCompleteResult() {
  const { emailAccountId } = useAccount();
  const router = useRouter();

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
      <div className="text-sm font-medium text-green-800 dark:text-green-200">
        Your agent is now active! It will process incoming emails automatically.
      </div>
      <Button
        className="mt-3"
        onClick={() => router.push(`/${emailAccountId}/agent`)}
      >
        Go to Agent
      </Button>
    </div>
  );
}

function ToolCard({
  label,
  children,
}: {
  label: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const hasDetails = !!children;

  return (
    <div className="mb-2">
      <button
        type="button"
        className={`flex items-center gap-1.5 text-xs text-muted-foreground ${hasDetails ? "cursor-pointer hover:text-foreground" : "cursor-default"}`}
        onClick={() => hasDetails && setOpen((prev) => !prev)}
      >
        {hasDetails && (
          <ChevronRightIcon
            className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
          />
        )}
        <span>{label}</span>
      </button>
      {open && children && (
        <div className="mt-2 ml-4.5 space-y-2">{children}</div>
      )}
    </div>
  );
}

function formatExecutionResult(result?: {
  success?: boolean;
  requiresApproval?: boolean;
  reason?: string;
  error?: string;
}) {
  if (!result) return "No result";
  if (result.requiresApproval) return "Requires approval";
  if (result.success) return "Success";
  if (result.reason) return `Blocked: ${result.reason}`;
  if (result.error) return `Failed: ${result.error}`;
  return "Unknown result";
}
