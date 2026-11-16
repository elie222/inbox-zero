"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { SettingCard } from "@/components/SettingCard";
import { useDraftReplies } from "@/app/(app)/[emailAccountId]/assistant/settings/DraftReplies";
import { Tooltip } from "@/components/Tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KnowledgeBase } from "@/app/(app)/[emailAccountId]/assistant/knowledge/KnowledgeBase";
import { DraftDocsSites } from "@/app/(app)/[emailAccountId]/assistant/knowledge/DraftDocsSites";

export function DraftKnowledgeSetting() {
  const { t } = useLingui();
  const { enabled, loading } = useDraftReplies();

  const isEnabled = !loading && enabled;

  const kb = <KnowledgeDialog enabled={isEnabled} />;

  return (
    <SettingCard
      title={t`Draft knowledge base`}
      description={t`Information the assistant uses when writing replies.`}
      right={
        isEnabled ? (
          kb
        ) : (
          <Tooltip content={t`Enable draft replies to edit the knowledge base`}>
            <span>{kb}</span>
          </Tooltip>
        )
      }
    />
  );
}

function KnowledgeDialog({ enabled }: { enabled: boolean }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!enabled}>
          <Trans>Manage</Trans>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <Trans>Draft knowledge base</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>This is used to help the assistant draft replies.</Trans>
          </DialogDescription>
        </DialogHeader>
        <KnowledgeBase />
        <DraftDocsSites />
      </DialogContent>
    </Dialog>
  );
}
