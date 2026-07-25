"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { formatDistanceToNow } from "date-fns";
import {
  setCarddavAccessAction,
  setGoogleContactsSyncAction,
  syncGoogleContactsAction,
} from "@/utils/actions/contact";
import type { GoogleContactsSyncMode } from "@/generated/prisma/enums";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cn } from "@/utils";
import { getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type SyncState = {
  provider: string | null;
  googleMode: GoogleContactsSyncMode;
  googleSyncedAt: Date | string | null;
  carddavEnabled: boolean;
};

const GOOGLE_MODES: {
  mode: GoogleContactsSyncMode;
  label: string;
  description: string;
}[] = [
  {
    mode: "OFF",
    label: "Off",
    description: "No syncing with Google Contacts.",
  },
  {
    mode: "PULL",
    label: "Pull only (one-way)",
    description:
      "Imports and updates contacts from Google. Nothing is pushed back, so you can review and enrich freely.",
  },
  {
    mode: "TWO_WAY",
    label: "Two-way sync",
    description:
      "Pulls from Google and pushes your edits and deletes back. Turning this on pushes everything saved here to Google once.",
  },
];

export function SyncSettingsDialog({
  open,
  onClose,
  sync,
  mutateContacts,
}: {
  open: boolean;
  onClose: () => void;
  sync: SyncState;
  mutateContacts: () => void;
}) {
  const { emailAccountId, userEmail } = useAccount();

  const setMode = useAction(
    setGoogleContactsSyncAction.bind(null, emailAccountId),
    {
      onSuccess: (result) => {
        toastSuccess({
          description:
            result.data?.mode === "OFF"
              ? "Google Contacts sync is off"
              : result.data?.mode === "PULL"
                ? "Pulling contacts from Google (one-way)"
                : "Two-way sync is on — pushing saved contacts to Google",
        });
        mutateContacts();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
        mutateContacts();
      },
    },
  );

  const syncNow = useAction(
    syncGoogleContactsAction.bind(null, emailAccountId),
    {
      onSuccess: (result) => {
        const { created = 0, updated = 0, deleted = 0 } = result.data ?? {};
        toastSuccess({
          description: `Synced: ${created} new, ${updated} updated, ${deleted} removed`,
        });
        mutateContacts();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  const [carddavPassword, setCarddavPassword] = useState<string | null>(null);

  const carddav = useAction(setCarddavAccessAction.bind(null, emailAccountId), {
    onSuccess: (result) => {
      setCarddavPassword(result.data?.password ?? null);
      if (!result.data?.enabled) {
        toastSuccess({ description: "CardDAV access disabled" });
      }
      mutateContacts();
    },
    onError: (error) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const isGoogle = sync.provider === "google";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contact sync</DialogTitle>
        </DialogHeader>

        {isGoogle ? (
          <div className="space-y-4">
            <div>
              <Label>Google Contacts</Label>
              <div className="mt-2 space-y-2">
                {GOOGLE_MODES.map(({ mode, label, description }) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={setMode.isExecuting}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left",
                      sync.googleMode === mode
                        ? "border-primary ring-1 ring-primary"
                        : "border-border hover:border-muted-foreground/40",
                    )}
                    onClick={() => setMode.execute({ mode })}
                  >
                    <div className="text-sm font-medium">{label}</div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {sync.googleMode !== "OFF" && (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  {sync.googleSyncedAt
                    ? `Last pulled ${formatDistanceToNow(
                        new Date(sync.googleSyncedAt),
                        { addSuffix: true },
                      )}. Also pulls hourly.`
                    : "Not pulled yet."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  loading={syncNow.isExecuting}
                  onClick={() => syncNow.execute({})}
                >
                  Pull now
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Requires the Google Contacts permission. If sync fails with a
              permission error, sign out and back in to grant it (the
              NEXT_PUBLIC_CONTACTS_ENABLED flag must be on so login requests the
              contacts scope).
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Contact sync is currently available for Google accounts only.
          </p>
        )}

        <div className="space-y-4 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="carddav-access">
                iPhone &amp; iPad (CardDAV)
              </Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Sync contacts to your phone by adding a CardDAV account in iOS
                Settings.
              </p>
            </div>
            <Switch
              id="carddav-access"
              checked={sync.carddavEnabled}
              disabled={carddav.isExecuting}
              onCheckedChange={(enabled) => carddav.execute({ enabled })}
            />
          </div>

          {carddavPassword && (
            <div className="space-y-1 rounded-md border border-border p-3 text-sm">
              <p className="font-medium">
                Add this account on your iPhone — the password is shown only
                once:
              </p>
              <p className="text-muted-foreground">
                iOS Settings → Apps → Contacts → Contacts Accounts → Add Account
                → Other → Add CardDAV Account
              </p>
              <p>
                Server:{" "}
                <code className="select-all">
                  {typeof window !== "undefined" ? window.location.origin : ""}
                  /api/carddav
                </code>
              </p>
              <p>
                Username: <code className="select-all">{userEmail}</code>
              </p>
              <p>
                Password: <code className="select-all">{carddavPassword}</code>
              </p>
            </div>
          )}

          {sync.carddavEnabled && !carddavPassword && (
            <p className="text-xs text-muted-foreground">
              CardDAV access is on. Lost the password? Toggle off and on to
              generate a new one.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
