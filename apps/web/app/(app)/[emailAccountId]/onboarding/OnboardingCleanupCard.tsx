"use client";

import { CheckIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { ENTER_ANIMATION } from "@/app/(app)/[emailAccountId]/onboarding/ChatOnboardingChatPane";
import { UnsubscribeSuggestionRow } from "@/app/(app)/[emailAccountId]/onboarding/UnsubscribeSuggestionRow";
import type { Newsletter } from "@/app/(app)/[emailAccountId]/onboarding/useInboxScan";
import { pluralize } from "@/utils/string";
import { cn } from "@/utils";

export type CleanupResult = {
  unsubscribedCount: number;
  keptAll: boolean;
  failedCount: number;
};

export function OnboardingCleanupCard({
  senders,
  deselected,
  onToggleSender,
  selectedCount,
  onUnsubscribe,
  submitting,
  result,
}: {
  senders: Newsletter[];
  deselected: Set<string>;
  onToggleSender: (name: string) => void;
  selectedCount: number;
  onUnsubscribe: () => void;
  submitting: boolean;
  result: CleanupResult | null;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-background shadow-sm",
        ENTER_ANIMATION,
      )}
    >
      <div className="flex items-baseline justify-between border-b px-4 py-3">
        <div className="text-base font-semibold tracking-tight">Cleanup</div>
        {!result && (
          <span className="text-xs text-muted-foreground">
            {selectedCount} of {senders.length} selected
          </span>
        )}
      </div>

      {result ? (
        <ResultLine result={result} />
      ) : (
        <div className="py-2">
          {senders.map((sender) => (
            <UnsubscribeSuggestionRow
              key={sender.name}
              sender={sender}
              checked={!deselected.has(sender.name)}
              onToggle={() => {
                if (!submitting) onToggleSender(sender.name);
              }}
              clickable
              iconSize={28}
              progressClassName="w-14"
              labelClassName="w-12"
              className="cursor-pointer px-4 py-1.5 hover:bg-muted/50"
            />
          ))}
          <div className="flex items-center gap-4 px-4 pb-2 pt-3">
            <Button onClick={onUnsubscribe} disabled={submitting}>
              {submitting && <ButtonLoader />}
              {selectedCount > 0
                ? `Unsubscribe from ${selectedCount}`
                : "Keep them all"}
            </Button>
            {selectedCount > 0 && (
              <button
                type="button"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                disabled={submitting}
                onClick={() => {
                  for (const sender of senders) {
                    if (!deselected.has(sender.name)) {
                      onToggleSender(sender.name);
                    }
                  }
                }}
              >
                Keep them all
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultLine({ result }: { result: CleanupResult }) {
  const succeeded = result.unsubscribedCount > 0 || result.keptAll;
  const text =
    result.unsubscribedCount > 0
      ? `Unsubscribed from ${result.unsubscribedCount} ${pluralize(
          result.unsubscribedCount,
          "newsletter",
        )}${result.failedCount > 0 ? `, ${result.failedCount} failed` : ""}`
      : result.keptAll
        ? "Kept all newsletters"
        : "Couldn't finish the cleanup. Retry from Bulk Unsubscribe in the app.";

  return (
    <div className="flex items-center gap-2 px-4 py-3 text-sm">
      {succeeded ? (
        <CheckIcon className="size-4 text-green-600" />
      ) : (
        <TriangleAlertIcon className="size-4 text-amber-600" />
      )}
      {text}
    </div>
  );
}
