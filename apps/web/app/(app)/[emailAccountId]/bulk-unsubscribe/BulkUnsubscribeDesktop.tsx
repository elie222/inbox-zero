"use client";

import type React from "react";
import { ActionCell } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/common";
import type { RowProps } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import { Checkbox } from "@/components/Checkbox";
import { SenderIcon } from "@/components/charts/DomainIcon";
import { extractDomainFromEmail } from "@/utils/email";

export function BulkUnsubscribeDesktop({
  tableRows,
  selectedCount,
  onClearSelection,
}: {
  tableRows?: React.ReactNode;
  selectedCount: number;
  onClearSelection: () => void;
}) {
  return (
    <div className="flex flex-col">
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 px-5 py-3 bg-blue-50 dark:bg-blue-950 border-b border-blue-200 dark:border-blue-800">
          <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
            {selectedCount} selected
          </span>
          <button
            type="button"
            onClick={onClearSelection}
            className="ml-auto px-2.5 py-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 rounded transition-colors"
          >
            Clear selection
          </button>
        </div>
      )}
      <div className="flex flex-col divide-y divide-border">{tableRows}</div>
    </div>
  );
}

export function BulkUnsubscribeRowDesktop({
  item,
  refetchPremium,
  selected,
  onSelectRow,
  onDoubleClick,
  hasUnsubscribeAccess,
  mutate,
  onOpenNewsletter,
  labels,
  openPremiumModal,
  userEmail,
  emailAccountId,
  onToggleSelect,
  checked,
}: RowProps) {
  const domain = extractDomainFromEmail(item.name);

  return (
    <div
      className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
      onMouseEnter={onSelectRow}
      onDoubleClick={onDoubleClick}
    >
      <Checkbox
        checked={checked}
        onChange={() => onToggleSelect?.(item.name)}
      />
      <SenderIcon domain={domain} name={item.fromName || item.name} />
      <div className="flex flex-col min-w-0 flex-1">
        <span className="font-semibold text-foreground truncate">
          {item.fromName || item.name}
        </span>
        {item.fromName && (
          <span className="text-sm text-muted-foreground truncate">
            {item.name}
          </span>
        )}
      </div>
      <span className="text-sm text-muted-foreground whitespace-nowrap">
        {item.value} emails
      </span>
      <div className="flex items-center gap-2">
        <ActionCell
          item={item}
          hasUnsubscribeAccess={hasUnsubscribeAccess}
          mutate={mutate}
          refetchPremium={refetchPremium}
          onOpenNewsletter={onOpenNewsletter}
          selected={selected}
          labels={labels}
          openPremiumModal={openPremiumModal}
          userEmail={userEmail}
          emailAccountId={emailAccountId}
        />
      </div>
    </div>
  );
}
