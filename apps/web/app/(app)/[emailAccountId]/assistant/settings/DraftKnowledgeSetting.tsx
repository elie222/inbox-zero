"use client";

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

export function DraftKnowledgeSetting() {
  const { enabled, loading } = useDraftReplies();

  const isEnabled = !loading && enabled;

  const kb = <KnowledgeDialog enabled={isEnabled} />;

  return (
    <SettingCard
      title="Draft knowledge base"
      description="Information the assistant uses when writing replies."
      right={
        isEnabled ? (
          kb
        ) : (
          <Tooltip content="Enable draft replies to edit the knowledge base">
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
          Manage
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Draft knowledge base</DialogTitle>
          <DialogDescription>
            This is used to help the assistant draft replies.
          </DialogDescription>
        </DialogHeader>
        <KnowledgeBase />
      </DialogContent>
    </Dialog>
  );
}
