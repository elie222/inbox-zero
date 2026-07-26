"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { ViewLearnedPatterns } from "@/app/(app)/[emailAccountId]/assistant/group/ViewLearnedPatterns";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createGroupAction } from "@/utils/actions/group";
import { learnPatternsFromHistoryAction } from "@/utils/actions/learn-patterns";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toastError, toastSuccess } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import { Skeleton } from "@/components/ui/skeleton";

export function LearnedPatternsDialog({
  ruleId,
  groupId,
  disabled,
  label = "View learned patterns",
}: {
  ruleId: string;
  groupId: string | null;
  disabled?: boolean;
  label?: string;
}) {
  const { emailAccountId } = useAccount();

  const [learnedPatternGroupId, setLearnedPatternGroupId] = useState<
    string | null
  >(groupId);

  const { execute, isExecuting } = useAction(
    createGroupAction.bind(null, emailAccountId),
    {
      onSuccess: (data) => {
        if (data.data?.groupId) {
          setLearnedPatternGroupId(data.data.groupId);
        } else {
          toastError({
            description: "There was an error setting up learned patterns.",
          });
        }
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error),
        });
      },
    },
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={async () => {
            if (!ruleId) return;
            if (groupId) return;
            if (isExecuting) return;

            execute({ ruleId });
          }}
        >
          {label}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Learned patterns</DialogTitle>
          <DialogDescription>
            Learned patterns are patterns that the AI has learned from your
            email history. When a learned pattern is matched other rules
            conditions are skipped and this rule is automatically selected.
          </DialogDescription>
        </DialogHeader>

        {isExecuting ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          learnedPatternGroupId && (
            <ViewLearnedPatterns groupId={learnedPatternGroupId} />
          )
        )}

        <LearnFromHistory ruleId={ruleId} />
      </DialogContent>
    </Dialog>
  );
}

// Patterns normally accrue only as new AI-matched mail arrives; this mines
// the mail this rule has already been applied to, on demand
function LearnFromHistory({ ruleId }: { ruleId: string }) {
  const { emailAccountId } = useAccount();

  const learn = useAction(
    learnPatternsFromHistoryAction.bind(null, emailAccountId),
    {
      onSuccess: (result) => {
        if (!result.data) return;
        const { candidates, queued } = result.data;
        toastSuccess({
          description: candidates
            ? `Analyzing ${queued} sender${queued === 1 ? "" : "s"} from this rule's history — patterns that qualify appear here within a few minutes.`
            : "No senders qualify yet — a sender needs at least 3 emails this rule was consistently applied to.",
        });
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
      <p className="text-sm text-muted-foreground">
        Patterns are learned as new mail matches this rule with AI. You can also
        learn from mail it already handled.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        loading={learn.isExecuting}
        onClick={() => learn.execute({ ruleId })}
      >
        Learn from history
      </Button>
    </div>
  );
}
