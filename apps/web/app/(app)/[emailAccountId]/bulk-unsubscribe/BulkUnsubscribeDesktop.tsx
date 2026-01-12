"use client";

import type React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ActionCell,
  HeaderButton,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/common";
import type { RowProps } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import { Checkbox } from "@/components/Checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DomainIcon } from "@/components/charts/DomainIcon";
import { extractDomainFromEmail } from "@/utils/email";

export function BulkUnsubscribeDesktop({
  tableRows,
  sortColumn,
  sortDirection,
  onSort,
  isAllSelected,
  onToggleSelectAll,
}: {
  tableRows?: React.ReactNode;
  sortColumn: "emails" | "unread" | "unarchived";
  sortDirection: "asc" | "desc";
  onSort: (column: "emails" | "unread" | "unarchived") => void;
  isAllSelected: boolean;
  onToggleSelectAll: () => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pr-0">
            <Checkbox checked={isAllSelected} onChange={onToggleSelectAll} />
          </TableHead>
          <TableHead>
            <span className="text-sm font-medium">From</span>
          </TableHead>
          <TableHead>
            <HeaderButton
              sorted={sortColumn === "emails"}
              sortDirection={
                sortColumn === "emails" ? sortDirection : undefined
              }
              onClick={() => onSort("emails")}
            >
              Received
            </HeaderButton>
          </TableHead>
          <TableHead>
            <HeaderButton
              sorted={sortColumn === "unread"}
              sortDirection={
                sortColumn === "unread" ? sortDirection : undefined
              }
              onClick={() => onSort("unread")}
            >
              Read
            </HeaderButton>
          </TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>{tableRows}</TableBody>
    </Table>
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
  readPercentage,
}: RowProps) {
  const domain = extractDomainFromEmail(item.name) || item.name;

  return (
    <TableRow
      key={item.name}
      className={selected ? "bg-blue-50 dark:bg-muted/50" : undefined}
      aria-selected={selected || undefined}
      data-selected={selected || undefined}
      onMouseEnter={onSelectRow}
      onDoubleClick={onDoubleClick}
    >
      <TableCell className="pr-0">
        <Checkbox
          checked={checked}
          onChange={() => onToggleSelect?.(item.name)}
        />
      </TableCell>
      <TableCell className="max-w-[250px] truncate py-3">
        <div className="flex items-center gap-2">
          <DomainIcon domain={domain} size={32} />
          <div className="flex flex-col">
            <span className="font-medium">{item.fromName || item.name}</span>
            {item.fromName && (
              <span className="text-xs text-muted-foreground">{item.name}</span>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground">{item.value} emails</span>
      </TableCell>
      <TableCell>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              <RadialProgress
                value={readPercentage}
                size={28}
                strokeWidth={4}
              />
              <span className="text-sm text-muted-foreground">
                {Math.round(readPercentage)}%
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {item.readEmails} read. {item.value - item.readEmails} unread.
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="p-1">
        <div className="flex justify-end items-center gap-2">
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
      </TableCell>
    </TableRow>
  );
}

function RadialProgress({
  value,
  size = 32,
  strokeWidth = 3,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-blue-100 dark:text-blue-900"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        className="text-blue-500 transition-all duration-300"
      />
    </svg>
  );
}
