"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { SparklesIcon } from "lucide-react";
import type { Thread } from "@/components/email-list/types";
import type { FilterPreviewResponse } from "@/app/api/mail/filter-preview/route";
import {
  createMailFilterAction,
  proposeRuleFromEmailAction,
} from "@/utils/actions/mail-filter";
import { useAccount } from "@/providers/EmailAccountProvider";
import { decodeSnippet } from "@/utils/gmail/decode";
import { getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { cn } from "@/utils";
import { Loading } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// "Rule from this email": the AI proposes a destination folder + match
// scope; the user reviews the rule, its last-7-days impact, and the
// toggles, then creates the folder & rule in one go.
export function AiRuleFromEmailDialog({
  thread,
  onClose,
  refetch,
}: {
  thread: Thread;
  onClose: () => void;
  refetch: () => void;
}) {
  const { emailAccountId } = useAccount();
  const lastMessage = thread.messages?.at(-1);
  const from = lastMessage?.headers.from ?? "";
  const subject = lastMessage?.headers.subject ?? "";
  const snippet = decodeSnippet(thread.snippet || lastMessage?.snippet || "");

  const [folderName, setFolderName] = useState("");
  const [matchType, setMatchType] = useState<"sender" | "domain">("domain");
  const [matchValue, setMatchValue] = useState("");
  const [skipInbox, setSkipInbox] = useState(true);
  const [markRead, setMarkRead] = useState(false);
  const [star, setStar] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const propose = useAction(
    proposeRuleFromEmailAction.bind(null, emailAccountId),
    {
      onSuccess: (result) => {
        if (!result.data) return;
        setFolderName(result.data.folderName);
        setMatchType(result.data.matchType);
        setMatchValue(result.data.matchValue);
        setSkipInbox(result.data.skipInbox);
        setMarkRead(result.data.markRead);
        setReason(result.data.reason);
      },
      onError: (error) => {
        setFailed(getActionErrorMessage(error.error));
      },
    },
  );

  const { execute: executePropose } = propose;
  useEffect(() => {
    if (from) executePropose({ from, subject, snippet });
  }, [executePropose, from, subject, snippet]);

  const { data: preview } = useSWR<FilterPreviewResponse>(
    matchValue
      ? `/api/mail/filter-preview?matchType=${matchType}&value=${encodeURIComponent(matchValue)}`
      : null,
  );

  const create = useAction(createMailFilterAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: `Rule created — filing into ${folderName}` });
      refetch();
      onClose();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const proposing = propose.isExecuting || (!matchValue && !failed);

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SparklesIcon className="size-4 text-primary" />
            Rule from this email
          </DialogTitle>
          <DialogDescription>
            AI-proposed rule — review, preview, then create. Nothing is saved
            until you approve.
          </DialogDescription>
        </DialogHeader>

        {failed ? (
          <p className="py-4 text-sm text-muted-foreground">{failed}</p>
        ) : proposing ? (
          <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <Loading />
            Analyzing this email…
          </div>
        ) : (
          <div className="space-y-4">
            {reason && (
              <p className="text-sm text-muted-foreground">{reason}</p>
            )}
            <div>
              <Label htmlFor="ai-rule-folder">Folder name</Label>
              <Input
                id="ai-rule-folder"
                className="mt-2"
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
              />
            </div>
            <div>
              <Label>Rule</Label>
              <div className="mt-2 break-all rounded-md border border-border px-3 py-2.5 font-mono text-sm">
                from {matchType === "domain" ? "ends_with" : "is"} "{matchValue}
                "
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <ToggleChip
                pressed={skipInbox}
                onClick={() => setSkipInbox(!skipInbox)}
              >
                Skip inbox
              </ToggleChip>
              <ToggleChip
                pressed={markRead}
                onClick={() => setMarkRead(!markRead)}
              >
                Mark read
              </ToggleChip>
              <ToggleChip pressed={star} onClick={() => setStar(!star)}>
                Star
              </ToggleChip>
            </div>
            {preview?.countable && (
              <div className="rounded-md border border-border px-3 py-2.5 text-sm text-muted-foreground">
                Last 7 days:{" "}
                <span className="font-semibold text-foreground">
                  {preview.last7Days}
                </span>{" "}
                would move here ·{" "}
                {Math.max(0, preview.scanned7Days - (preview.last7Days ?? 0))}{" "}
                untouched of {preview.scanned7Days} scanned.
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={!folderName.trim() || !matchValue}
                loading={create.isExecuting}
                onClick={() =>
                  create.execute({
                    matchType,
                    value: matchValue,
                    labelName: folderName.trim(),
                    skipInbox,
                    markRead,
                    star,
                    applyToExisting: false,
                  })
                }
              >
                Create folder & rule
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ToggleChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "rounded-md border px-3 py-1.5 text-sm",
        pressed
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-muted-foreground/40",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
