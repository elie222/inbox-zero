"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select } from "@/components/Select";
import { useAction } from "next-safe-action/hooks";
import {
  testApplyFollowUpLabelAction,
  testGenerateFollowUpDraftAction,
} from "@/utils/actions/follow-up-reminders";
import { toastError, toastSuccess } from "@/components/Toast";
import type { ThreadsResponse } from "@/app/api/threads/route";

export function TestFollowUpModal({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");

  const { data: threadsData, isLoading: isLoadingThreads } =
    useSWR<ThreadsResponse>(open ? "/api/threads?limit=20" : null);

  const { execute: executeApplyLabel, isExecuting: isApplyingLabel } =
    useAction(testApplyFollowUpLabelAction.bind(null, emailAccountId), {
      onSuccess: () => {
        toastSuccess({ description: "Follow-up label applied!" });
      },
      onError: (error) => {
        toastError({
          description:
            error.error?.serverError ?? "Failed to apply follow-up label",
        });
      },
    });

  const { execute: executeGenerateDraft, isExecuting: isGeneratingDraft } =
    useAction(testGenerateFollowUpDraftAction.bind(null, emailAccountId), {
      onSuccess: () => {
        toastSuccess({ description: "Follow-up draft created!" });
      },
      onError: (error) => {
        toastError({
          description:
            error.error?.serverError ?? "Failed to generate follow-up draft",
        });
      },
    });

  const threadOptions =
    threadsData?.threads.map((thread) => {
      const lastMessage = thread.messages[thread.messages.length - 1];
      const subject = lastMessage?.headers?.subject || "(No subject)";
      const from = lastMessage?.headers?.from || "Unknown";
      const truncatedSubject =
        subject.length > 40 ? `${subject.substring(0, 40)}...` : subject;
      const truncatedFrom =
        from.length > 30 ? `${from.substring(0, 30)}...` : from;

      return {
        label: `${truncatedSubject} - ${truncatedFrom}`,
        value: thread.id,
      };
    }) ?? [];

  const isExecuting = isApplyingLabel || isGeneratingDraft;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          Testing
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Testing</DialogTitle>
          <DialogDescription>
            Test follow-up reminder functionality on your recent threads.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Select
            name="thread"
            label="Select a recent thread"
            options={
              isLoadingThreads
                ? [{ label: "Loading...", value: "" }]
                : threadOptions.length > 0
                  ? threadOptions
                  : [{ label: "No threads found", value: "" }]
            }
            value={selectedThreadId}
            onChange={(e) => setSelectedThreadId(e.target.value)}
            disabled={isLoadingThreads || threadOptions.length === 0}
          />

          <div className="flex flex-col gap-2">
            <Button
              onClick={() => executeApplyLabel({ threadId: selectedThreadId })}
              disabled={!selectedThreadId || isExecuting}
              loading={isApplyingLabel}
              size="sm"
            >
              Apply Follow-up Label
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                executeGenerateDraft({ threadId: selectedThreadId })
              }
              disabled={!selectedThreadId || isExecuting}
              loading={isGeneratingDraft}
              size="sm"
            >
              Generate Follow-up Draft
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
