"use client";

import { Badge } from "@/components/Badge";

type LabelConfig = {
  name: string;
  actions: ("label" | "skipInbox")[];
};

interface LabelsPreviewProps {
  items: LabelConfig[];
}

export function LabelsPreview({ items }: LabelsPreviewProps) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="divide-y">
        {items.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between px-4 py-2.5"
          >
            <span className="font-medium">{item.name}</span>
            <div className="flex gap-1.5">
              {item.actions.map((action) => (
                <ActionBadge key={action} action={action} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: "label" | "skipInbox" }) {
  const isLabel = action === "label";
  return (
    <Badge color={isLabel ? "blue" : "yellow"}>
      {isLabel ? "Label" : "Skip Inbox"}
    </Badge>
  );
}

export const DEFAULT_LABEL_CONFIG: LabelConfig[] = [
  { name: "To Reply", actions: ["label"] },
  { name: "Awaiting Reply", actions: ["label"] },
  { name: "Actioned", actions: ["label"] },
  { name: "FYI", actions: ["label"] },
  { name: "Newsletter", actions: ["label"] },
  { name: "Calendar", actions: ["label"] },
  { name: "Receipt", actions: ["label"] },
  { name: "Notification", actions: ["label"] },
  { name: "Marketing", actions: ["skipInbox", "label"] },
  { name: "Cold Email", actions: ["skipInbox", "label"] },
];
