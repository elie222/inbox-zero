"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { BrainIcon } from "lucide-react";
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
import { useAccount } from "@/providers/EmailAccountProvider";
import { toastError } from "@/components/Toast";
import { Skeleton } from "@/components/ui/skeleton";

export function LearnedPatternsDialog({
  ruleId,
  groupId,
}: {
  ruleId: string;
  groupId: string | null;
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
          description: error.error.serverError || "Unknown error",
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
          Icon={BrainIcon}
          onClick={async () => {
            if (!ruleId) return;
            if (groupId) return;
            if (isExecuting) return;

            execute({ ruleId });
          }}
        >
          View learned patterns
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Learned Patterns</DialogTitle>
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
      </DialogContent>
    </Dialog>
  );
}
