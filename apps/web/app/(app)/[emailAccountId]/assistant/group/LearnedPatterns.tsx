"use client";

import { useState } from "react";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ViewGroup } from "@/app/(app)/[emailAccountId]/assistant/group/ViewGroup";
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

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            if (!ruleId) return;

            if (groupId) return;

            const result = await createGroupAction(emailAccountId, { ruleId });

            if (result?.serverError) {
              toastError({ description: result.serverError });
            } else if (!result?.data?.groupId) {
              toastError({
                description: "There was an error setting up learned patterns.",
              });
            } else {
              setLearnedPatternGroupId(result.data.groupId);
            }
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

        {learnedPatternGroupId && <ViewGroup groupId={learnedPatternGroupId} />}
      </DialogContent>
    </Dialog>
  );
}

function LearnedPatterns({ groupId }: { groupId: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="overflow-hidden rounded-lg border"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between bg-background p-4 hover:bg-muted">
        <div className="flex items-center gap-2">
          <BrainIcon size={16} className="text-muted-foreground" />
          <span className="font-medium">Learned Patterns</span>
        </div>

        <div className="flex items-center gap-4">
          <ChevronDownIcon
            size={16}
            className={`transform transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <ViewGroup groupId={groupId} />
      </CollapsibleContent>
    </Collapsible>
  );
}
