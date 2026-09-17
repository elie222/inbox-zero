"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingContent } from "@/components/LoadingContent";
import {
  cancelLocalMailOfflineSnapshot,
  readLocalMailOfflineSnapshot,
} from "@/utils/email-cache/local-mail-attachments";
import {
  LocalMailOfflineConversationChangedError,
  prepareLocalMailOfflineConversation,
} from "@/utils/email-cache/local-mail-offline-plan";
import { keepLocalMailConversationOffline } from "@/utils/email-cache/local-mail-offline-save";
import {
  forgetLocalMailOfflineDownloadWaits,
  isLocalMailOfflineFileExhausted,
  isLocalMailOfflineFileStorable,
} from "@/utils/email-cache/local-mail-offline-runner";
import {
  isMailSyncActivated,
  subscribeToMailActivation,
} from "@/utils/email-cache/mail-activation";

type Plan = Awaited<ReturnType<typeof prepareLocalMailOfflineConversation>>;
type Snapshot = NonNullable<
  Awaited<ReturnType<typeof readLocalMailOfflineSnapshot>>
>;

/**
 * Keeps one conversation readable without a network, and reports honestly how
 * far that has got.
 *
 * Saving is two steps on purpose. Preparing quotes what the copy will cost
 * from the provider's own sizes, and only a confirmation reserves the space,
 * because a reservation can evict other downloads to make room. Updating an
 * existing copy skips the quote: that conversation is already wanted.
 */
export function KeepOfflineDialog({
  emailAccountId,
  threadId,
  open,
  onOpenChange,
}: {
  emailAccountId: string;
  threadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const controller = useRef<AbortController | null>(null);
  const [quote, setQuote] = useState<Plan>();
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const syncEnabled = useSyncExternalStore(
    subscribeToMailActivation,
    useCallback(() => isMailSyncActivated(emailAccountId), [emailAccountId]),
    () => false,
  );

  // A conversation that is not kept offline reads as `null`, never as
  // `undefined`: that distinction is what tells "not kept" from "not read
  // yet", both here and in the cache this key leaves behind when it closes.
  const { data: snapshot, mutate } = useSWR(
    open && emailAccountId && threadId
      ? ["local-mail-offline-snapshot", emailAccountId, threadId]
      : null,
    async ([, accountId, id]) =>
      (await readLocalMailOfflineSnapshot({
        emailAccountId: accountId,
        threadId: id,
      })) ?? null,
    {
      // Poll only while there is something left to wait for.
      refreshInterval: (latest) =>
        latest && !latest.invalidated && !ready(latest) ? 1000 : 0,
    },
  );

  // Closing the dialog abandons an in-flight prepare or save, and reopening
  // it starts from a controller that has not been aborted. Switching
  // conversations remounts this dialog, so the thread is not a dependency.
  useEffect(() => {
    if (!open) return;
    const current = new AbortController();
    controller.current = current;
    return () => current.abort();
  }, [open]);

  const prepare = useCallback(async () => {
    const signal = controller.current?.signal;
    if (!signal || signal.aborted) return;
    setPreparing(true);
    setError("");
    try {
      const prepared = await prepareLocalMailOfflineConversation({
        emailAccountId,
        threadId,
        signal,
      });
      if (signal.aborted) return;
      setQuote(prepared);
      return prepared;
    } catch (caught) {
      if (!signal.aborted) setError(describe(caught));
    } finally {
      setPreparing(false);
    }
  }, [emailAccountId, threadId]);

  const save = useCallback(
    async (prepared: Plan) => {
      const signal = controller.current?.signal;
      if (!signal || signal.aborted) return;
      setSaving(true);
      setError("");
      try {
        await keepLocalMailConversationOffline(prepared, signal);
        if (signal.aborted) return;
        forgetLocalMailOfflineDownloadWaits(emailAccountId);
        setQuote(undefined);
        await mutate();
      } catch (caught) {
        if (!signal.aborted) setError(describe(caught));
      } finally {
        setSaving(false);
      }
    },
    [emailAccountId, mutate],
  );

  useEffect(() => {
    if (!open) {
      setQuote(undefined);
      setError("");
      return;
    }
    // Only a conversation known not to be kept offline needs a quote.
    if (snapshot !== null || quote || preparing || saving) return;
    prepare();
  }, [open, snapshot, quote, preparing, saving, prepare]);

  const remove = async () => {
    setError("");
    try {
      await cancelLocalMailOfflineSnapshot({ emailAccountId, threadId });
      // Write the removal into the cache rather than revalidating: reopening
      // the dialog reads this key from the cache and would otherwise show the
      // copy that was just removed.
      await mutate(null, { revalidate: false });
      onOpenChange(false);
    } catch (caught) {
      setError(describe(caught));
    }
  };

  const update = async () => {
    const prepared = await prepare();
    if (prepared) await save(prepared);
  };

  const busy = preparing || saving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keep this conversation offline</DialogTitle>
          <DialogDescription>
            Its messages and attachments stay on this device and are kept when
            storage runs low.
          </DialogDescription>
        </DialogHeader>

        <LoadingContent loading={snapshot === undefined}>
          {snapshot ? (
            <SnapshotStatus snapshot={snapshot} syncEnabled={syncEnabled} />
          ) : (
            <Quote quote={quote} preparing={preparing} />
          )}
        </LoadingContent>

        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          {snapshot ? (
            <>
              {snapshot.invalidated && (
                <Button disabled={busy} onClick={update}>
                  {busy ? "Updating…" : "Update offline copy"}
                </Button>
              )}
              <Button onClick={remove} variant="outline">
                Remove offline copy
              </Button>
            </>
          ) : (
            <Button
              disabled={!quote || busy}
              onClick={() => quote && save(quote)}
            >
              {saving ? "Saving…" : "Keep offline"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Quote({
  quote,
  preparing,
}: {
  quote: Plan | undefined;
  preparing: boolean;
}) {
  if (preparing || !quote)
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Checking what this conversation needs…
      </p>
    );
  return (
    <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
      <p>
        {count(quote.messageCount, "message")} and{" "}
        {count(quote.attachmentCount, "attachment")}
      </p>
      <p>{formatBytes(quote.knownAttachmentBytes)} of attachments</p>
      {quote.unknownSizeCount > 0 && (
        <p className="text-muted-foreground">
          {count(quote.unknownSizeCount, "file")} did not report a size and may
          add to that total.
        </p>
      )}
    </div>
  );
}

function SnapshotStatus({
  snapshot,
  syncEnabled,
}: {
  snapshot: Snapshot;
  syncEnabled: boolean;
}) {
  const available = ready(snapshot);
  const tooLarge = snapshot.files.filter(
    (file) => !isLocalMailOfflineFileStorable(file),
  );
  const unavailable = snapshot.files.filter(
    (file) =>
      file.state !== "complete" &&
      isLocalMailOfflineFileStorable(file) &&
      isLocalMailOfflineFileExhausted(file),
  );
  return (
    <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
      {snapshot.invalidated ? (
        <p className="font-medium">
          This conversation changed. Update the offline copy to include what is
          new.
        </p>
      ) : (
        <p className="font-medium">
          {available ? "Available offline" : "Saving for offline use…"}
        </p>
      )}
      {snapshot.files.length > 0 && <p>{storedLine(snapshot)}</p>}
      {!snapshot.messagesReady && !snapshot.invalidated && (
        <p>Messages are still being saved.</p>
      )}
      {snapshot.unknownSizeCount > 0 && (
        <p className="text-muted-foreground">
          {count(snapshot.unknownSizeCount, "file")} did not report a size.
        </p>
      )}
      {tooLarge.length > 0 && (
        <p className="text-muted-foreground">
          {count(tooLarge.length, "file")} too large to keep offline. Download
          them while you are online.
        </p>
      )}
      {unavailable.length > 0 && (
        <p className="text-muted-foreground">
          {count(unavailable.length, "file")} could not be downloaded.
        </p>
      )}
      {!available && !syncEnabled && (
        <p className="text-muted-foreground">
          Syncing this account on this device is off, so the remaining files
          will not download until you turn it back on.
        </p>
      )}
    </div>
  );
}

/**
 * Reports progress only while there is progress left to make. A finished copy
 * states what it stored, because the provider's reported total is an estimate
 * and reading "99 bytes of 2.5 KB" next to "Available offline" invites doubt
 * about a copy that is in fact complete.
 */
function storedLine(snapshot: Snapshot) {
  const stored = snapshot.files.filter((file) => file.state === "complete");
  if (ready(snapshot))
    return `${count(stored.length, "attachment")} stored (${formatBytes(snapshot.cachedBytes)})`;
  const knownBytes = snapshot.files.reduce(
    (total, file) => total + (file.reportedBytes ?? 0),
    0,
  );
  const bytes =
    knownBytes > 0
      ? ` (${formatBytes(snapshot.cachedBytes)} of ${formatBytes(knownBytes)})`
      : "";
  return `${stored.length.toLocaleString()} of ${count(snapshot.files.length, "attachment")} stored${bytes}`;
}

function ready(snapshot: Snapshot) {
  return snapshot.messagesReady && snapshot.attachmentsReady;
}

function count(value: number, noun: string) {
  return `${value.toLocaleString()} ${noun}${value === 1 ? "" : "s"}`;
}

function formatBytes(bytes: number) {
  const units = ["bytes", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

function describe(caught: unknown) {
  if (caught instanceof LocalMailOfflineConversationChangedError)
    return "This conversation is changing too quickly to save right now. Try again in a moment.";
  return caught instanceof Error && caught.message
    ? caught.message
    : "The offline copy could not be saved. Please try again.";
}
