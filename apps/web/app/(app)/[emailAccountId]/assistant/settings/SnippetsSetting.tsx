"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { SettingCard } from "@/components/SettingCard";
import { SnippetsManager } from "@/components/snippets/SnippetsManager";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SnippetsSetting() {
  const { t } = useLingui();

  return (
    <SettingCard
      description={t`Reuse saved replies in drafts by typing / followed by a shortcut.`}
      right={
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Trans>Manage</Trans>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                <Trans>Snippets</Trans>
              </DialogTitle>
              <DialogDescription>
                <Trans>Saved replies you can insert from compose with /.</Trans>
              </DialogDescription>
            </DialogHeader>
            <SnippetsManager />
          </DialogContent>
        </Dialog>
      }
      title={t`Snippets`}
    />
  );
}
