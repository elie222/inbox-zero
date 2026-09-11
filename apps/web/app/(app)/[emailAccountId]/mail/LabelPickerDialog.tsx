"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2Icon } from "lucide-react";
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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useLabels } from "@/hooks/useLabels";
import { useAccount } from "@/providers/EmailAccountProvider";
import { createLabelAction } from "@/utils/actions/mail";
import { applyThreadLabelsAction } from "@/utils/actions/mail-label";
import { applyThreadLabelsInBatches } from "@/utils/label/apply-thread-labels";
import { getActionErrorMessage } from "@/utils/error";

const GMAIL_CATEGORY_NAMES: Record<string, string> = {
  CATEGORY_PERSONAL: "Personal",
  CATEGORY_SOCIAL: "Social",
  CATEGORY_PROMOTIONS: "Promotions",
  CATEGORY_UPDATES: "Updates",
  CATEGORY_FORUMS: "Forums",
};

export function LabelPickerDialog({
  threadIds,
  onClose,
  onApplied,
  mode = "label",
}: {
  threadIds: string[];
  onClose: () => void;
  onApplied: (threadIds: string[], labelId: string) => void;
  mode?: "label" | "move";
}) {
  const { emailAccountId } = useAccount();
  const { userLabels, isLoading, error, mutate } = useLabels(emailAccountId);
  const [search, setSearch] = useState("");
  const [isPending, setIsPending] = useState(false);
  const pending = useRef(false);
  const [remainingThreadIds, setRemainingThreadIds] = useState(threadIds);
  const createdLabel = useRef<{ name: string; id: string } | null>(null);
  const isMove = mode === "move";
  const name = search.trim();
  const labels = useMemo(
    () =>
      userLabels
        .map((label) => ({
          ...label,
          displayName: getLabelDisplayName(label.id, label.name),
        }))
        .sort(
          (a, b) =>
            a.displayName.localeCompare(b.displayName, "en") ||
            a.id.localeCompare(b.id, "en"),
        ),
    [userLabels],
  );
  const canCreate =
    name.length > 0 &&
    !labels.some(
      (label) => label.displayName.toLowerCase() === name.toLowerCase(),
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
              removeFromInbox: isMove,
            });
            if (!result?.data)
              throw new Error(getActionErrorMessage(result ?? {}));
            return result.data;
          },
        });
      if (succeededThreadIds.length) {
        onApplied(succeededThreadIds, id);
        toast.success(getSuccessMessage(mode, succeededThreadIds.length));
      }
      setRemainingThreadIds(failedThreadIds);
      if (failedThreadIds.length) {
        toast.error(getPartialFailureMessage(mode, failedThreadIds.length), {
          description: error instanceof Error ? error.message : undefined,
        });
      } else onClose();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isMove
            ? "Couldn't move conversations. Please try again."
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
        aria-describedby={undefined}
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
        hideCloseButton
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        <DialogTitle className="sr-only">
          {isMove ? "Move conversations" : "Label conversations"}
        </DialogTitle>
        <Command className="[&_[cmdk-input-wrapper]>svg]:hidden">
          <CommandInput
            aria-label="Search labels"
            className="pr-8"
            placeholder={isMove ? "Move to…" : "Label as…"}
            value={search}
            onValueChange={setSearch}
            disabled={isPending}
          />
          <LoadingContent loading={isLoading} error={error}>
            <CommandList aria-busy={isPending}>
              <CommandEmpty>No matching labels.</CommandEmpty>
              <CommandGroup>
                {labels.map((label) => (
                  <CommandItem
                    key={label.id}
                    value={label.id}
                    keywords={[label.name, label.displayName]}
                    onSelect={() => apply(label.id)}
                    disabled={isPending}
                  >
                    <span className="break-all">{label.displayName}</span>
                  </CommandItem>
                ))}
                {canCreate && (
                  <CommandItem
                    value={`create:${name}`}
                    onSelect={() => apply()}
                    disabled={isPending}
                  >
                    <span className="break-all">Create “{name}”</span>
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </LoadingContent>
        </Command>
        {isPending && (
          <div
            className="absolute top-3.5 right-3 text-muted-foreground"
            role="status"
          >
            <Loader2Icon aria-hidden className="size-4 animate-spin" />
            <span className="sr-only">
              {isMove ? "Moving…" : "Applying label…"}
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getSuccessMessage(mode: "label" | "move", count: number) {
  if (mode === "move")
    return count === 1 ? "Moved" : `Moved ${count} conversations`;
  return count === 1
    ? "Label applied"
    : `Label applied to ${count} conversations`;
}

function getPartialFailureMessage(mode: "label" | "move", count: number) {
  const action = mode === "move" ? "move" : "label";
  const plural = count === 1 ? "" : "s";
  return `Couldn't ${action} ${count} conversation${plural}. Select a label to retry.`;
}

function getLabelDisplayName(id: string, name: string) {
  return GMAIL_CATEGORY_NAMES[id] ?? name;
}
