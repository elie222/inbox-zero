"use client";

import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemActions,
  ItemSeparator,
} from "@/components/ui/item";
import { CopyRulesDialog } from "@/app/(app)/[emailAccountId]/settings/CopyRulesDialog";

type Account = {
  id: string;
  name: string | null;
  email: string;
};

export function CopyRulesSection({
  emailAccountId,
  emailAccountEmail,
  allAccounts,
}: {
  emailAccountId: string;
  emailAccountEmail: string;
  allAccounts: Account[];
}) {
  const [open, setOpen] = useState(false);

  const sourceAccounts = allAccounts.filter((a) => a.id !== emailAccountId);

  if (sourceAccounts.length === 0) return null;

  return (
    <>
      <ItemSeparator />
      <Item size="sm">
        <ItemContent>
          <ItemTitle>
            <Trans>Copy Rules From Another Account</Trans>
          </ItemTitle>
        </ItemContent>
        <ItemActions>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <ArrowLeftRight className="mr-2 size-4" />
            <Trans>Copy Rules</Trans>
          </Button>
        </ItemActions>
      </Item>

      <CopyRulesDialog
        open={open}
        onOpenChange={setOpen}
        targetAccountId={emailAccountId}
        targetAccountEmail={emailAccountEmail}
        sourceAccounts={sourceAccounts}
      />
    </>
  );
}
