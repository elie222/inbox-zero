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
  providerConversationId,
  teammates,
  onShared,
}: {
  memberId: string;
  emailAccountId: string;
  providerConversationId: string;
  teammates: Array<{
    id: string;
    emailAccount: { name: string | null; email: string; image: string | null };
  }>;
  onShared: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [mutationId, setMutationId] = useState(() => crypto.randomUUID());
  const { executeAsync, isExecuting } = useAction(shareConversationAction);
  const [error, setError] = useState("");
  const close = () => {
    setOpen(false);
    setSelected([]);
    setError("");
    setMutationId(crypto.randomUUID());
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
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
            Selected teammates will see your past and future messages in this
            conversation, including branches where email recipients change. They
            can post internal comments; they cannot send email from your
            account. Existing discussion history becomes visible if sharing is
            restarted.
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
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!selected.length || isExecuting}
            onClick={async () => {
              setError("");
              const result = await executeAsync({
                memberId,
                source: { emailAccountId, providerConversationId },
                participantMemberIds: selected,
                clientMutationId: mutationId,
              });
              if (result?.data) {
                close();
                onShared();
              } else
                setError(
                  getActionErrorMessage(
                    result?.serverError
                      ? { serverError: result.serverError }
                      : result?.validationErrors
                        ? { validationErrors: result.validationErrors }
                        : undefined,
                  ),
                );
            }}
          >
            {isExecuting ? "Sharing…" : "Share conversation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
