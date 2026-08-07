"use client";

import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { UnsubscribeSuggestionRow } from "@/app/(app)/[emailAccountId]/onboarding/UnsubscribeSuggestionRow";
import type { Newsletter } from "@/app/(app)/[emailAccountId]/onboarding/useInboxScan";

// The newsletter cleanup checklist as an inline chat card. Unsubscribing only
// ever happens through these explicit clicks, never from chat text.
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
  result: { unsubscribedCount: number } | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm duration-300 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-baseline justify-between border-b px-4 py-3">
        <div className="text-base font-semibold tracking-tight">Cleanup</div>
        {!result && (
          <span className="text-xs text-muted-foreground">
            {selectedCount} of {senders.length} selected
          </span>
        )}
      </div>

      {result ? (
        <div className="flex items-center gap-2 px-4 py-3 text-sm">
          <CheckIcon className="size-4 text-green-600" />
          {result.unsubscribedCount > 0
            ? `Unsubscribed from ${result.unsubscribedCount} ${
                result.unsubscribedCount === 1 ? "newsletter" : "newsletters"
              }`
            : "Kept all newsletters"}
        </div>
      ) : (
        <div className="py-2">
          {senders.map((sender) => (
            <UnsubscribeSuggestionRow
              key={sender.name}
              sender={sender}
              checked={!deselected.has(sender.name)}
              onToggle={() => onToggleSender(sender.name)}
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
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
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
