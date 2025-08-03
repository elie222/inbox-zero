"use client";

import { KnowledgeDialog } from "@/app/(app)/[emailAccountId]/assistant/knowledge/KnowledgeDialog";
import { SettingCard } from "@/components/SettingCard";
import { useDraftReplies } from "@/app/(app)/[emailAccountId]/assistant/settings/DraftReplies";
import { Tooltip } from "@/components/Tooltip";

export function DraftKnowledgeSetting() {
  const { enabled, loading } = useDraftReplies();

  const isEnabled = !loading && enabled;

  const kb = <KnowledgeDialog enabled={isEnabled} />;

  return (
    <SettingCard
      title="Draft knowledge base"
      description="Provide extra knowledge to the assistant to help it draft better replies."
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
