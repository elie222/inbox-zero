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
import { useFolders } from "@/hooks/useFolders";
import { useLabels } from "@/hooks/useLabels";
import { useAccount } from "@/providers/EmailAccountProvider";
import { createLabelAction } from "@/utils/actions/mail";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { getActionErrorMessage } from "@/utils/error";
import {
  FOLDER_SEPARATOR,
  flattenOutlookFolders,
} from "@/utils/outlook/folders";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import type { MetadataChange } from "@inboxzero/mail-core/commands";
import type { MailClient } from "@inboxzero/mail-core/engine";
import { randomUuid } from "@/utils/uuid";

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
  const { emailAccountId, provider } = useAccount();
  const client = useOptionalMailClient();
  const isMove = mode === "move";
  // Outlook categories don't change where a message lives, so moves target real folders.
  const isFolderMove = isMove && isMicrosoftProvider(provider);
  const {
    userLabels,
    isLoading: isLoadingLabels,
    error: labelsError,
    mutate,
  } = useLabels(emailAccountId);
  const {
    folders,
    isLoading: isLoadingFolders,
    error: foldersError,
  } = useFolders(isFolderMove ? provider : "", emailAccountId);
  const [search, setSearch] = useState("");
  const [isPending, setIsPending] = useState(false);
  const pending = useRef(false);
  const [remainingThreadIds, setRemainingThreadIds] = useState(threadIds);
  const createdLabel = useRef<{ name: string; id: string } | null>(null);
  const name = search.trim();
  const labels = useMemo(() => {
    const options = isFolderMove
      ? flattenOutlookFolders(folders)
          .filter((folder) => !folder.systemType)
          .map((folder) => ({
            id: folder.id,
            name: folder.displayName,
            displayName: folder.path.split(FOLDER_SEPARATOR).join(" / "),
          }))
      : userLabels.map((label) => ({
          id: label.id,
          name: label.name,
          displayName: getLabelDisplayName(label.id, label.name),
        }));
    return options.sort(
      (a, b) =>
        a.displayName.localeCompare(b.displayName, "en") ||
        a.id.localeCompare(b.id, "en"),
    );
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
          mutate().catch(() => {});
        }
      }
      if (!client) throw new Error("Mail engine is unavailable");
      const changes: MetadataChange[] = isFolderMove
        ? [{ kind: "move", folderId: id }]
        : [
            {
              kind: "set_membership",
              membership: "label",
              id,
              present: true,
            },
            ...(isMove ? [{ kind: "archive" } as const] : []),
          ];
      const { succeededThreadIds, failedThreadIds, error } =
        await applyEngineChanges({
          client,
          emailAccountId,
          threadIds: remainingThreadIds,
          changes,
        });
      if (succeededThreadIds.length) {
        onApplied(succeededThreadIds, id);
        toast.success(getSuccessMessage(mode, succeededThreadIds.length));
      }
      setRemainingThreadIds(failedThreadIds);
      if (failedThreadIds.length) {
        toast.error(
          getPartialFailureMessage(mode, failedThreadIds.length, isFolderMove),
          {
            description: error instanceof Error ? error.message : undefined,
          },
        );
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

function getSuccessMessage(mode: "label" | "move", count: number) {
  if (mode === "move")
    return count === 1 ? "Moved" : `Moved ${count} conversations`;
  return count === 1
    ? "Label applied"
    : `Label applied to ${count} conversations`;
}

function getPartialFailureMessage(
  mode: "label" | "move",
  count: number,
  isFolderMove: boolean,
) {
  const action = mode === "move" ? "move" : "label";
  const plural = count === 1 ? "" : "s";
  const target = isFolderMove ? "folder" : "label";
  return `Couldn't ${action} ${count} conversation${plural}. Select a ${target} to retry.`;
}

function getLabelDisplayName(id: string, name: string) {
  return GMAIL_CATEGORY_NAMES[id] ?? name;
}

async function applyEngineChanges({
  client,
  emailAccountId,
  threadIds,
  changes,
}: {
  client: MailClient;
  emailAccountId: string;
  threadIds: string[];
  changes: MetadataChange[];
}) {
  const succeededThreadIds: string[] = [];
  const failedThreadIds: string[] = [];
  let error: unknown;
  for (const threadId of threadIds) {
    try {
      let admitted = true;
      for (const change of changes) {
        const admission = await client.submitConversations({
          accountId: emailAccountId,
          commandId: randomUuid(),
          conversations: [
            { accountId: emailAccountId, conversationId: threadId },
          ],
          change,
          observedRevision: (await client.getDiagnostics(emailAccountId))
            .revision,
        });
        if (admission.status === "rejected") {
          admitted = false;
          break;
        }
      }
      (admitted ? succeededThreadIds : failedThreadIds).push(threadId);
    } catch (cause) {
      error = cause;
      failedThreadIds.push(threadId);
    }
  }
  return { succeededThreadIds, failedThreadIds, error };
}
