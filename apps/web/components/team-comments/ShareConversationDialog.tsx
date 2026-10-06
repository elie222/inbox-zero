"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { shareConversationAction } from "@/utils/actions/team-comments";
import { getActionErrorMessage } from "@/utils/error";

export function ShareConversationDialog({
  memberId,
  emailAccountId,
  threadId,
  teammates,
  onShared,
}: {
  memberId: string;
  emailAccountId: string;
  threadId: string;
  teammates: Array<{
    id: string;
    emailAccount: { name: string | null; email: string; image: string | null };
  }>;
  onShared: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const { executeAsync, isExecuting } = useAction(shareConversationAction);
  const [error, setError] = useState("");
  const close = () => {
    setOpen(false);
    setSelected([]);
    setError("");
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else if (!isExecuting) close();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Share
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share conversation</DialogTitle>
          <DialogDescription>
            Teammates can read this conversation, including future replies, and
            leave internal comments. They can't send email from your account.
          </DialogDescription>
        </DialogHeader>
        <div
          className="max-h-64 space-y-3 overflow-auto"
          aria-label="Select teammates"
          role="group"
        >
          {teammates.map((teammate) => (
            <div
              className="flex cursor-pointer items-center gap-3"
              key={teammate.id}
            >
              <Checkbox
                id={`share-teammate-${teammate.id}`}
                checked={selected.includes(teammate.id)}
                onCheckedChange={(checked) =>
                  setSelected((current) =>
                    checked
                      ? [...current, teammate.id]
                      : current.filter((id) => id !== teammate.id),
                  )
                }
              />
              <label htmlFor={`share-teammate-${teammate.id}`}>
                {teammate.emailAccount.name ?? teammate.emailAccount.email}
              </label>
            </div>
          ))}
        </div>
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={isExecuting}>
            Cancel
          </Button>
          <Button
            disabled={!selected.length || isExecuting}
            onClick={async () => {
              setError("");
              const result = await executeAsync({
                memberId,
                source: { emailAccountId, threadId },
                participantMemberIds: selected,
              });
              if (result?.data) {
                close();
                onShared();
              } else setError(getActionErrorMessage(result ?? {}));
            }}
          >
            {isExecuting ? "Sharing…" : "Share conversation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
