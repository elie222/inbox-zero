"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import useSWR from "swr";
import { Controller, useForm } from "react-hook-form";
import { HardDriveIcon } from "lucide-react";
import { useAccount } from "@/providers/EmailAccountProvider";
import { LoadingContent } from "@/components/LoadingContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getEmailCacheDatabase } from "@/utils/email-cache/database";
import {
  readLocalMailSettings,
  writeLocalMailSettings,
  type LocalMailSettings,
} from "@/utils/email-cache/local-mail-settings";

import {
  isMailSyncActivated,
  setMailSyncEnabled,
  subscribeToMailActivation,
} from "@/utils/email-cache/mail-activation";

import { ClearLocalMailDownloads } from "./ClearLocalMailDownloads";

const MIB = 1024 * 1024;

export function LocalMailSettingsDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="size-8 shrink-0 rounded-lg"
          aria-label="Local mail settings"
        >
          <HardDriveIcon className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mail on this device</DialogTitle>
          <DialogDescription>
            Storage is shared by your mail accounts on this device. Older mail
            downloads while space is available.
          </DialogDescription>
        </DialogHeader>
        {open && <LocalMailSettingsForm />}
      </DialogContent>
    </Dialog>
  );
}

function LocalMailSettingsForm() {
  const { emailAccountId } = useAccount();
  const syncEnabled = useSyncExternalStore(
    subscribeToMailActivation,
    useCallback(() => isMailSyncActivated(emailAccountId), [emailAccountId]),
    () => false,
  );
  const [syncError, setSyncError] = useState("");
  const [initial] = useState(readLocalMailSettings);
  const { register, control, handleSubmit } = useForm({
    defaultValues: {
      budget: String(initial.budgetBytes / MIB),
      attachmentBudget: String(initial.attachmentBudgetBytes / MIB),
      backfill: initial.backfillEnabled,
      push: initial.pushEnabled,
    },
  });
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [persistence, setPersistence] = useState<string>();
  const [requestingPersistence, setRequestingPersistence] = useState(false);
  const { data, error, isLoading, mutate } = useSWR(
    emailAccountId ? ["local-mail-settings-status", emailAccountId] : null,
    ([, accountId]) => readStatus(accountId),
    { refreshInterval: 5000 },
  );
  const save = handleSubmit(({ budget, attachmentBudget, backfill, push }) => {
    setSaveError("");
    setMessage("");
    const settings: LocalMailSettings = {
      budgetBytes: Number(budget) * MIB,
      attachmentBudgetBytes: Number(attachmentBudget) * MIB,
      backfillEnabled: backfill,
      pushEnabled: push,
    };
    if (
      !Number.isSafeInteger(settings.budgetBytes) ||
      settings.budgetBytes < 64 * MIB ||
      !Number.isSafeInteger(settings.attachmentBudgetBytes) ||
      settings.attachmentBudgetBytes < 0 ||
      settings.attachmentBudgetBytes > settings.budgetBytes
    ) {
      setSaveError(
        "Use at least 64 MiB for mail. Attachment storage must fit within that total.",
      );
      return;
    }
    try {
      writeLocalMailSettings(settings);
      setMessage("Saved for this device.");
    } catch {
      setSaveError(
        "Settings could not be saved. Check that browser storage is available and try again.",
      );
    }
  });
  return (
    <div className="space-y-5">
      <LoadingContent loading={isLoading} error={error}>
        {data && (
          <div
            className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm"
            role="region"
            aria-label="Local mail status"
          >
            <p className="font-medium">This account</p>
            {data.available ? (
              <>
                <p>{data.messages.toLocaleString()} messages stored locally</p>
                <p>
                  {data.pending.toLocaleString()} updates awaiting search
                  indexing
                </p>
                <p>
                  {data.coverage
                    ? `Completed download range: ${formatDate(data.coverage.after)} – ${formatDate(data.coverage.before)}`
                    : "No complete download range yet."}
                </p>
                <p>
                  {data.lastSyncedAt
                    ? `Last synchronized: ${new Date(data.lastSyncedAt).toLocaleString()}`
                    : "Waiting for the first synchronization."}
                </p>
                {data.recovering && (
                  <p>Checking previously downloaded mail for changes.</p>
                )}
                {data.storagePaused && (
                  <p>Older downloads are paused for storage space.</p>
                )}
                {data.unsupported && (
                  <p>Background downloads are unavailable for this account.</p>
                )}
              </>
            ) : (
              <p>
                Local storage is unavailable. Online mail remains available.
              </p>
            )}
          </div>
        )}
      </LoadingContent>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="local-mail-sync">
              Sync this account on this device
            </Label>
            <p className="text-muted-foreground text-xs">
              When off, downloaded mail stays available and pending actions
              still send.
            </p>
          </div>
          <Switch
            id="local-mail-sync"
            checked={syncEnabled}
            onCheckedChange={(enabled) => {
              setSyncError("");
              try {
                setMailSyncEnabled(emailAccountId, enabled);
              } catch {
                setSyncError(
                  "This preference could not be saved. Please try again.",
                );
              }
            }}
          />
        </div>
        {syncError && (
          <p role="alert" className="text-destructive text-sm">
            {syncError}
          </p>
        )}
      </div>
      <form className="space-y-4" onSubmit={save}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="local-mail-budget">Mail storage (MiB)</Label>
            <Input
              id="local-mail-budget"
              type="number"
              min={64}
              step="any"
              required
              {...register("budget")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="local-attachment-budget">Attachments (MiB)</Label>
            <Input
              id="local-attachment-budget"
              type="number"
              min={0}
              step="any"
              required
              {...register("attachmentBudget")}
            />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          Attachments count toward the mail total. Available device space may
          lower these limits. Reducing them can remove older, unpinned
          downloads.
        </p>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="local-mail-backfill">Download older mail</Label>
            <p className="text-muted-foreground text-xs">
              Current mail still updates when paused.
            </p>
          </div>
          <Controller
            name="backfill"
            control={control}
            render={({ field }) => (
              <Switch
                id="local-mail-backfill"
                checked={field.value}
                onCheckedChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            )}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="local-mail-push">Faster mail updates</Label>
            <p className="text-muted-foreground text-xs">
              Use live signals in addition to periodic checks.
            </p>
          </div>
          <Controller
            name="push"
            control={control}
            render={({ field }) => (
              <Switch
                id="local-mail-push"
                checked={field.value}
                onCheckedChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            )}
          />
        </div>
        {saveError && (
          <p role="alert" className="text-destructive text-sm">
            {saveError}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        <Button type="submit">Save settings</Button>
      </form>
      <ClearLocalMailDownloads
        key={emailAccountId}
        emailAccountId={emailAccountId}
        generation={data?.available ? data.generation : undefined}
        syncEnabled={syncEnabled}
        onComplete={() => {
          mutate();
        }}
      />
      <div className="space-y-2 border-t pt-4">
        <p className="text-muted-foreground text-xs">
          Your browser may remove local downloads when space is low. You can ask
          it to keep this site's storage.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={requestingPersistence}
          onClick={async () => {
            setRequestingPersistence(true);
            try {
              const kept = await navigator.storage?.persist?.();
              setPersistence(
                kept
                  ? "Persistent storage is enabled."
                  : "Persistent storage was not granted. Downloads may still be removed by the browser.",
              );
            } catch {
              setPersistence(
                "Persistent storage is unavailable in this browser.",
              );
            } finally {
              setRequestingPersistence(false);
            }
          }}
        >
          Request persistent storage
        </Button>
        {persistence && (
          <p role="status" className="text-xs">
            {persistence}
          </p>
        )}
      </div>
    </div>
  );
}

async function readStatus(emailAccountId: string) {
  const database = await getEmailCacheDatabase();
  if (!database) return { available: false as const };
  const tx = database.transaction([
    "localMailSyncStates",
    "searchIndexAccounts",
    "localMailMessages",
    "searchIndexWork",
  ]);
  const [state, account, messages, pending] = await Promise.all([
    tx.objectStore("localMailSyncStates").get(emailAccountId),
    tx.objectStore("searchIndexAccounts").get(emailAccountId),
    tx
      .objectStore("localMailMessages")
      .index("byAccount")
      .count(emailAccountId),
    tx.objectStore("searchIndexWork").index("byAccount").count(emailAccountId),
  ]);
  await tx.done;
  const current = state?.generation === account?.generation ? state : undefined;
  return {
    available: true as const,
    generation: account?.generation,
    messages,
    pending,
    coverage: current?.coverage,
    lastSyncedAt: current?.lastSyncedAt,
    recovering: current?.recovering,
    storagePaused: current?.storagePaused,
    unsupported: current?.unsupported,
  };
}

function formatDate(timestamp: number) {
  return timestamp <= -8_640_000_000_000_000
    ? "earliest mail"
    : new Date(timestamp).toLocaleDateString();
}
