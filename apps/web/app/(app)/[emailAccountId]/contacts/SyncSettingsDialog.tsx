"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { formatDistanceToNow } from "date-fns";
import { CheckIcon, XIcon } from "lucide-react";
import {
  reportCarddavSelfTestAction,
  setCarddavAccessAction,
  setGoogleContactsSyncAction,
  syncGoogleContactsAction,
} from "@/utils/actions/contact";
import {
  runCarddavSelfTest,
  type SelfTestResult,
} from "@/utils/carddav/self-test";
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
          description: `Pulled: ${created} new, ${updated} updated, ${deleted} removed. New people are in the People tab; anyone without a company shows under Unfiled.`,
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
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 text-sm text-muted-foreground">
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
                  className="shrink-0"
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
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
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
            <div className="space-y-3 rounded-md border border-border p-3 text-sm">
              <p className="font-medium">
                Add this account on your iPhone — the password is shown only
                once:
              </p>
              <p className="text-muted-foreground">
                iOS Settings → Apps → Contacts → Contacts Accounts → Add Account
                → Other → Add CardDAV Account
              </p>
              {/* These are typed into iOS by hand, so each gets its own line
                  and wraps — a phone is too narrow to keep them inline */}
              <dl className="space-y-2">
                <CredentialRow
                  label="Server"
                  // Only ever rendered after the client action returns a
                  // password, but the body still runs during SSR
                  value={`${typeof window === "undefined" ? "" : window.location.origin}/api/carddav`}
                />
                <CredentialRow label="Username" value={userEmail} />
                <CredentialRow label="Password" value={carddavPassword} />
              </dl>
            </div>
          )}

          {/* Runs iOS's exact setup conversation from this browser — same
              server, same transport — so "verification failed" on the phone
              can be split into our side vs the phone's side */}
          {sync.carddavEnabled && (
            <CarddavSelfTest email={userEmail} password={carddavPassword} />
          )}

          {sync.carddavEnabled && !carddavPassword && (
            <p className="text-xs text-muted-foreground">
              CardDAV access is on. Lost the password? Toggle off and on to
              generate a new one — devices still using the old password stop
              syncing until you update them.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// break-all, not break-words: a server URL and a generated password have no
// spaces to break at, so without it they run off the side of a phone
function CredentialRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="select-all break-all font-mono text-[13px]">{value}</dd>
    </div>
  );
}

function CarddavSelfTest({
  email,
  password,
}: {
  email: string;
  // Present right after enabling (shown-once); without it the test still
  // proves whether responses reach a client at all
  password: string | null;
}) {
  const { emailAccountId } = useAccount();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SelfTestResult | null>(null);

  const report = useAction(
    reportCarddavSelfTestAction.bind(null, emailAccountId),
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-muted-foreground">
          {password
            ? "Test the full setup conversation your phone will run."
            : "Test the connection (toggle off and on first to test with a password)."}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          loading={running}
          onClick={async () => {
            setRunning(true);
            try {
              const outcome = await runCarddavSelfTest({ email, password });
              setResult(outcome);
              report.execute(outcome);
            } finally {
              setRunning(false);
            }
          }}
        >
          Test connection
        </Button>
      </div>

      {result && (
        <ul className="space-y-1 rounded-md border border-border p-3">
          {result.steps.map((step) => (
            <li key={step.name} className="flex items-start gap-2 text-sm">
              {step.ok ? (
                <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-green-500" />
              ) : (
                <XIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              )}
              <span className="min-w-0">
                <span className="font-medium">{step.name}</span>{" "}
                <span className="text-muted-foreground">
                  {step.status ?? "no response"}
                  {step.bodyBytes !== null && ` · ${step.bodyBytes} bytes`}
                </span>
                {step.problem && (
                  <span className="block break-words text-xs text-destructive">
                    {step.problem}
                  </span>
                )}
              </span>
            </li>
          ))}
          <li className="pt-1 text-xs text-muted-foreground">
            {result.ok
              ? "Everything your phone needs is answering correctly — a failure on the phone now points at the phone's side."
              : "Something on the server side is broken — this result has been reported to the logs."}
          </li>
        </ul>
      )}
    </div>
  );
}
