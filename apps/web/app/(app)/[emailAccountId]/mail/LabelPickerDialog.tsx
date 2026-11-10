"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
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
import { useFolders } from "@/hooks/useFolders";
import { isHiddenLabel, isLabelsKey, useLabels } from "@/hooks/useLabels";
import { useAccount } from "@/providers/EmailAccountProvider";
import { createLabelAction } from "@/utils/actions/mail";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { getActionErrorMessage } from "@/utils/error";
import {
  FOLDER_SEPARATOR,
  flattenOutlookFolders,
} from "@/utils/outlook/folders";

const GMAIL_CATEGORY_NAMES: Record<string, string> = {
  CATEGORY_PERSONAL: "Personal",
  CATEGORY_SOCIAL: "Social",
  CATEGORY_PROMOTIONS: "Promotions",
  CATEGORY_UPDATES: "Updates",
  CATEGORY_FORUMS: "Forums",
};

export function LabelPickerDialog({
  threadKeys,
  onClose,
  onApply,
  mode = "label",
}: {
  threadKeys: string[];
  onClose: () => void;
  /** Queues the change and resolves with the thread keys it was queued for. */
  onApply: (
    threadKeys: string[],
    target: { kind: "label" | "folder"; id: string },
  ) => Promise<string[]>;
  mode?: "label" | "move";
}) {
  const { emailAccountId, provider } = useAccount();
  const isMove = mode === "move";
  // Outlook categories don't change where a message lives, so moves target real folders.
  const isFolderMove = isMove && isMicrosoftProvider(provider);
  const {
    userLabels,
    isLoading: isLoadingLabels,
    error: labelsError,
  } = useLabels(emailAccountId);
  const { mutate } = useSWRConfig();
  const {
    folders,
    isLoading: isLoadingFolders,
    error: foldersError,
  } = useFolders(isFolderMove ? provider : "", emailAccountId);
  const [search, setSearch] = useState("");
  const [isPending, setIsPending] = useState(false);
  const pending = useRef(false);
  const [remainingThreadKeys, setRemainingThreadKeys] = useState(threadKeys);
  const createdLabel = useRef<{ name: string; id: string } | null>(null);
  const name = search.trim();
  const labels = useMemo(() => {
    if (isFolderMove) {
      return flattenOutlookFolders(folders)
        .filter((folder) => !folder.systemType)
        .map((folder) => ({
          id: folder.id,
          name: folder.displayName,
          displayName: folder.path.split(FOLDER_SEPARATOR).join(" / "),
        }))
        .sort(
          (a, b) =>
            a.displayName.localeCompare(b.displayName, "en") ||
            a.id.localeCompare(b.id, "en"),
        );
    }
    // Match the sidebar: its label order, with hidden labels last.
    return [
      ...userLabels.filter((label) => !isHiddenLabel(label)),
      ...userLabels.filter(isHiddenLabel),
    ].map((label) => ({
      id: label.id,
      name: label.name,
      displayName: getLabelDisplayName(label.id, label.name),
    }));
  }, [isFolderMove, folders, userLabels]);
  const canCreate =
    !isFolderMove &&
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
          mutate(isLabelsKey).catch(() => {});
        }
      }
      const appliedKeys = new Set(
        await onApply(remainingThreadKeys, {
          kind: isFolderMove ? "folder" : "label",
          id,
        }),
      );
      const failedKeys = remainingThreadKeys.filter(
        (key) => !appliedKeys.has(key),
      );
      // The failure was already reported; stay open so a pick retries it.
      if (failedKeys.length) setRemainingThreadKeys(failedKeys);
      else onClose();
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
            aria-label={isFolderMove ? "Search folders" : "Search labels"}
            className="pr-8"
            placeholder={isMove ? "Move to…" : "Label as…"}
            value={search}
            onValueChange={setSearch}
            disabled={isPending}
          />
          <LoadingContent
            loading={isFolderMove ? isLoadingFolders : isLoadingLabels}
            error={isFolderMove ? foldersError : labelsError}
          >
            <CommandList aria-busy={isPending}>
              <CommandEmpty>
                {isFolderMove ? "No matching folders." : "No matching labels."}
              </CommandEmpty>
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

function getLabelDisplayName(id: string, name: string) {
  return GMAIL_CATEGORY_NAMES[id] ?? name;
}
