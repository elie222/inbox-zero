"use client";

import { useEffect, useRef, useState } from "react";
import type { Thread } from "@/components/email-list/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loading } from "@/components/Loading";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useLabels } from "@/hooks/useLabels";
import { getDisplayedMessage } from "@/utils/email/displayed-message";
import {
  finalizeReprocessAction,
  runRulesAction,
} from "@/utils/actions/ai-rule";
import { ActionType } from "@/generated/prisma/enums";
import { toastError, toastSuccess } from "@/components/Toast";

// Reprocess one email with a human in the loop: dry-run the rules first,
// and when the decision differs from where the email sits, ask before
// moving. Used by the row's sparkles icon and the open panel's Run AI.
export function ReprocessEmailDialog({
  thread,
  folderType,
  onClose,
  refetch,
}: {
  thread: Thread;
  folderType?: string;
  onClose: () => void;
  refetch: () => void;
}) {
  const { emailAccountId } = useAccount();
  const { userLabels } = useLabels();
  const [proposal, setProposal] = useState<{
    ruleName: string | null;
    folderName: string | null;
  } | null>(null);
  const [checking, setChecking] = useState(true);
  const [applying, setApplying] = useState(false);

  const message =
    getDisplayedMessage(thread, folderType) ??
    thread.messages?.[thread.messages.length - 1];

  const currentFolderNames = [
    ...new Set(
      (thread.messages ?? [])
        .flatMap((m) => m.labelIds ?? [])
        .map((id) => userLabels.find((label) => label.id === id)?.name)
        .filter((name): name is string => !!name),
    ),
  ];

  // Dry-run once on open (ref-guarded against strict-mode double effects)
  const startedRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per open
  useEffect(() => {
    if (startedRef.current || !message) return;
    startedRef.current = true;

    const check = async () => {
      try {
        const result = await runRulesAction(emailAccountId, {
          messageId: message.id,
          threadId: thread.id,
          isTest: true,
          rerun: true,
        });
        if (result?.serverError || !result?.data) {
          toastError({
            description: result?.serverError ?? "Couldn't check this email",
          });
          onClose();
          return;
        }
        const matched = result.data.find((entry) => entry.rule);
        const labelItem = matched?.actionItems?.find(
          (item) => item.type === ActionType.LABEL,
        );
        const folderName =
          labelItem?.label ??
          (labelItem?.labelId
            ? (userLabels.find((label) => label.id === labelItem.labelId)
                ?.name ?? null)
            : null);

        if (folderName && currentFolderNames.includes(folderName)) {
          toastSuccess({
            description: `Already filed under ${folderName} — nothing to change.`,
          });
          onClose();
          return;
        }
        setProposal({ ruleName: matched?.rule?.name ?? null, folderName });
      } finally {
        setChecking(false);
      }
    };
    check();
  }, []);

  const applyProposal = async () => {
    if (!message) return;
    setApplying(true);
    try {
      const result = await runRulesAction(emailAccountId, {
        messageId: message.id,
        threadId: thread.id,
        isTest: false,
        rerun: true,
      });
      if (result?.serverError) {
        toastError({ description: result.serverError });
        return;
      }
      // The user confirmed the move — make it stick regardless of how the
      // old folder labels got there (backfills and hand-applied labels
      // leave no rule-execution trail for the automatic cleanup)
      const finalize = await finalizeReprocessAction(emailAccountId, {
        threadId: thread.id,
        keepLabelName: proposal?.folderName ?? null,
        returnToInbox: !proposal?.folderName,
      });
      if (finalize?.serverError) {
        toastError({ description: finalize.serverError });
        return;
      }
      toastSuccess({
        description: proposal?.folderName
          ? `Moved to ${proposal.folderName}`
          : "Returned to the inbox.",
      });
      refetch();
      onClose();
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        {checking || !proposal ? (
          <DialogHeader>
            <DialogTitle>Checking where this belongs…</DialogTitle>
            <DialogDescription asChild>
              <div className="flex items-center gap-2 pt-2">
                <Loading />
                <span>Running your rules against this email.</span>
              </div>
            </DialogDescription>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {proposal.folderName
                  ? `Move to ${proposal.folderName}?`
                  : "No rules match this email"}
              </DialogTitle>
              <DialogDescription>
                {proposal.folderName ? (
                  <>
                    The AI files this under{" "}
                    <span className="font-medium text-foreground">
                      {proposal.folderName}
                    </span>
                    {proposal.ruleName ? ` (rule: ${proposal.ruleName})` : ""}
                    {currentFolderNames.length
                      ? ` — it currently sits in ${currentFolderNames.join(", ")}.`
                      : "."}
                  </>
                ) : currentFolderNames.length ? (
                  <>
                    It currently sits in {currentFolderNames.join(", ")}.
                    Applying removes it from{" "}
                    {currentFolderNames.length === 1
                      ? "that folder"
                      : "those folders"}{" "}
                    and returns it to the inbox.
                  </>
                ) : (
                  <>Nothing to move — no rule files this email anywhere.</>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>
                Leave it
              </Button>
              <Button loading={applying} onClick={applyProposal}>
                {proposal.folderName
                  ? `Move to ${proposal.folderName}`
                  : "Return to inbox"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
