"use client";

import { type ReactNode, useState } from "react";
import { SignatureIcon, XIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import useSWR from "swr";
import { SignaturesDialog } from "@/app/(app)/[emailAccountId]/assistant/settings/SignaturesSetting";
import type { GetSignatureSuggestionsResponse } from "@/app/api/user/signature-suggestions/route";
import type { SidebarCard } from "@/components/sidebar-cards/SidebarCardStack";
import { Tooltip } from "@/components/Tooltip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAccount } from "@/providers/EmailAccountProvider";
import { dismissHintAction } from "@/utils/actions/hints";
import { getSignatureSuggestionsHintId } from "@/utils/email/default-signature";
import { getAccountScopedKey } from "@/utils/swr";

export function useSignatureSidebarCard(): {
  card: SidebarCard | null;
  dialog: ReactNode;
} {
  const { emailAccountId } = useAccount();
  const [open, setOpen] = useState(false);
  const { data, mutate } = useSWR<GetSignatureSuggestionsResponse>(
    emailAccountId
      ? getAccountScopedKey("/api/user/signature-suggestions", emailAccountId)
      : null,
    { revalidateOnFocus: false },
  );
  const { execute: dismissHint } = useAction(dismissHintAction);

  const suggestions = data?.suggestions ?? [];
  const needsDefault = data?.needsDefault ?? false;
  const dialog = (
    <SignaturesDialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) mutate();
      }}
      found={suggestions}
      needsDefault={needsDefault}
    />
  );
  if (suggestions.length === 0) return { card: null, dialog };

  const title = needsDefault
    ? "Add your signature"
    : suggestions.length === 1
      ? "Add your other signature"
      : `Add your ${suggestions.length} other signatures`;

  const dismiss = () => {
    mutate({ suggestions: [], needsDefault: false }, { revalidate: false });
    dismissHint({ hintId: getSignatureSuggestionsHintId(emailAccountId) });
  };

  const card: SidebarCard = {
    id: "signature-suggestions",
    content: (
      <Card className="p-3">
        <div className="flex items-start gap-2">
          <SignatureIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm leading-tight">{title}</p>
          </div>
          <button
            aria-label="Dismiss"
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted"
            onClick={dismiss}
            type="button"
          >
            <XIcon className="size-3" />
          </button>
        </div>
        <Button
          className="mt-3 h-8 w-full"
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
        >
          Add
        </Button>
      </Card>
    ),
    collapsedContent: (
      <Tooltip content={title} side="right">
        <Button
          aria-label={title}
          className="size-8"
          size="icon"
          variant="outline"
          onClick={() => setOpen(true)}
        >
          <SignatureIcon className="size-4" />
        </Button>
      </Tooltip>
    ),
  };
  return { card, dialog };
}
