"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import useSWR from "swr";
import type { GetSendAsResponse } from "@/app/api/user/send-as/route";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAccount } from "@/providers/EmailAccountProvider";
import { addSendersToMailSplitAction } from "@/utils/actions/mail-split";
import { getActionErrorMessage } from "@/utils/error";
import type { MailSplit } from "@/utils/split-inbox/split-query";
import {
  canAddSendersToSplit,
  getThreadSenders,
  type SenderThread,
} from "@/utils/split-inbox/split-senders";
import { getAccountScopedKey } from "@/utils/swr";

/** Adds the senders of the selected conversations to one of the account's splits. */
export function SplitPickerDialog({
  splits,
  threads,
  onClose,
  onApplied,
}: {
  splits: MailSplit[];
  threads: SenderThread[];
  onClose: () => void;
  onApplied: (splitId: string) => void;
}) {
  const { emailAccountId, userEmail } = useAccount();
  // Loaded on open rather than with the list, since only this action needs it.
  const { data: sendAs, isLoading: isLoadingSendAs } =
    useSWR<GetSendAsResponse>(
      getAccountScopedKey("/api/user/send-as", emailAccountId),
    );
  const senders = useMemo(
    () =>
      getThreadSenders(threads, [
        userEmail,
        ...(sendAs?.addresses.map((address) => address.email) ?? []),
      ]),
    [threads, userEmail, sendAs],
  );
  const [isPending, setIsPending] = useState(false);
  const pending = useRef(false);
  const senderCount = senders.length;

  const apply = async (split: MailSplit) => {
    if (pending.current) return;
    pending.current = true;
    setIsPending(true);
    let result: Awaited<ReturnType<typeof addSendersToMailSplitAction>>;
    try {
      result = await addSendersToMailSplitAction(emailAccountId, {
        id: split.id,
        senders,
      });
    } catch {
      toast.error("Couldn't add senders. Please try again.");
      return;
    } finally {
      pending.current = false;
      setIsPending(false);
    }

    if (result?.serverError || result?.validationErrors) {
      toast.error(getActionErrorMessage(result));
      return;
    }
    const added = result?.data?.added ?? 0;
    toast.success(
      added
        ? `Added ${pluralSenders(added)} to ${split.name}`
        : `${split.name} already includes ${senderCount === 1 ? "this sender" : "these senders"}`,
    );
    onApplied(split.id);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending.current) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
        hideCloseButton
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        <DialogTitle className="sr-only">Add senders to split</DialogTitle>
        <Command className="[&_[cmdk-input-wrapper]>svg]:hidden">
          <CommandInput
            aria-label="Search splits"
            className="pr-8"
            disabled={isPending || isLoadingSendAs || !senderCount}
            placeholder={
              isLoadingSendAs || senderCount
                ? `Add ${pluralSenders(senderCount)} to…`
                : "No senders to add"
            }
          />
          <CommandList aria-busy={isPending || isLoadingSendAs}>
            <CommandEmpty>No matching splits.</CommandEmpty>
            <CommandGroup>
              {splits.map((split) => {
                const eligible = canAddSendersToSplit(split);
                return (
                  <CommandItem
                    disabled={
                      isPending || isLoadingSendAs || !senderCount || !eligible
                    }
                    key={split.id}
                    keywords={[split.name]}
                    onSelect={() => apply(split)}
                    value={split.id}
                  >
                    <span className="flex-1 break-all">{split.name}</span>
                    {eligible ? null : (
                      <span className="shrink-0 text-muted-foreground text-xs">
                        Matches all conditions
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        {isPending && (
          <div
            className="absolute top-3.5 right-3 text-muted-foreground"
            role="status"
          >
            <Loader2Icon aria-hidden className="size-4 animate-spin" />
            <span className="sr-only">Adding senders…</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function pluralSenders(count: number) {
  return count === 1 ? "1 sender" : `${count} senders`;
}
