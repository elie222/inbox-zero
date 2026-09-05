"use client";

import { useRef, useState } from "react";
import { PlusIcon, TagIcon } from "lucide-react";
import { toast } from "sonner";
import { LoadingContent } from "@/components/LoadingContent";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLabels } from "@/hooks/useLabels";
import { useAccount } from "@/providers/EmailAccountProvider";
import { createLabelAction } from "@/utils/actions/mail";
import { applyThreadLabelsAction } from "@/utils/actions/mail-label";
import { applyThreadLabelsInBatches } from "@/utils/label/apply-thread-labels";
import { getActionErrorMessage } from "@/utils/error";

export function LabelPickerDialog({
  threadIds,
  onClose,
  onApplied,
}: {
  threadIds: string[];
  onClose: () => void;
  onApplied: (threadIds: string[], labelId: string) => void;
}) {
  const { emailAccountId } = useAccount();
  const { userLabels, isLoading, error, mutate } = useLabels(emailAccountId);
  const [search, setSearch] = useState("");
  const [isPending, setIsPending] = useState(false);
  const pending = useRef(false);
  const [remainingThreadIds, setRemainingThreadIds] = useState(threadIds);
  const createdLabel = useRef<{ name: string; id: string } | null>(null);
  const name = search.trim();
  const canCreate =
    name.length > 0 &&
    !userLabels.some(
      (label) => label.name.toLowerCase() === name.toLowerCase(),
    );

  async function apply(labelId?: string) {
    if (pending.current) return;
    pending.current = true;
    setIsPending(true);
    try {
      let id = labelId;
      if (!id) {
        if (createdLabel.current?.name === name) id = createdLabel.current.id;
        else {
          const result = await createLabelAction(emailAccountId, { name });
          if (!result?.data?.id)
            throw new Error(getActionErrorMessage(result ?? {}));
          id = result.data.id;
          createdLabel.current = { name, id };
          mutate().catch(() => {});
        }
      }
      const { succeededThreadIds, failedThreadIds, error } =
        await applyThreadLabelsInBatches({
          threadIds: remainingThreadIds,
          applyBatch: async (threadIds) => {
            const result = await applyThreadLabelsAction(emailAccountId, {
              threadIds,
              labelId: id,
            });
            if (!result?.data)
              throw new Error(getActionErrorMessage(result ?? {}));
            return result.data;
          },
        });
      if (succeededThreadIds.length) {
        onApplied(succeededThreadIds, id);
        toast.success(
          succeededThreadIds.length === 1
            ? "Label applied"
            : `Label applied to ${succeededThreadIds.length} conversations`,
        );
      }
      setRemainingThreadIds(failedThreadIds);
      if (failedThreadIds.length) {
        toast.error(
          `Couldn't label ${failedThreadIds.length} conversation${failedThreadIds.length === 1 ? "" : "s"}. Select a label to retry.`,
          { description: error instanceof Error ? error.message : undefined },
        );
      } else onClose();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't apply label. Please try again.",
      );
    } finally {
      pending.current = false;
      setIsPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending.current) onClose();
      }}
    >
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle>Label conversations</DialogTitle>
          <DialogDescription>
            {remainingThreadIds.length === 1
              ? "Apply a label to this conversation."
              : `Apply a label to ${remainingThreadIds.length} conversations.`}{" "}
            Conversations stay where they are.
          </DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput
            aria-label="Search labels"
            placeholder="Search or create a label…"
            value={search}
            onValueChange={setSearch}
            disabled={isPending}
          />
          <LoadingContent loading={isLoading} error={error}>
            <CommandList aria-busy={isPending}>
              <CommandEmpty>No matching labels.</CommandEmpty>
              <CommandGroup>
                {userLabels.map((label) => (
                  <CommandItem
                    key={label.id}
                    value={label.id}
                    keywords={[label.name]}
                    onSelect={() => apply(label.id)}
                    disabled={isPending}
                  >
                    <TagIcon className="mr-2 size-4 shrink-0" />
                    <span className="break-all">{label.name}</span>
                  </CommandItem>
                ))}
                {canCreate && (
                  <CommandItem
                    value={`create:${name}`}
                    onSelect={() => apply()}
                    disabled={isPending}
                  >
                    <PlusIcon className="mr-2 size-4 shrink-0" />
                    <span className="break-all">Create and apply “{name}”</span>
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </LoadingContent>
        </Command>
        {isPending && (
          <p className="px-4 py-2 text-muted-foreground text-sm" role="status">
            Applying label…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
