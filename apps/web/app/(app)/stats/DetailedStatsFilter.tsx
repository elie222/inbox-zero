"use client";

import * as React from "react";
import { DropdownMenuCheckboxItemProps } from "@radix-ui/react-dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils";

type Checked = DropdownMenuCheckboxItemProps["checked"];

export function DetailedStatsFilter(props: {
  label: string;
  icon: React.ReactNode;
  columns: {
    label: string;
    checked: Checked;
    setChecked: (value: Checked) => void;
  }[];
  keepOpenOnSelect?: boolean;
  className?: string;
}) {
  const { keepOpenOnSelect, className } = props;
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <DropdownMenu
      open={keepOpenOnSelect ? isOpen : undefined}
      onOpenChange={
        keepOpenOnSelect
          ? () => {
              if (!isOpen) setIsOpen(true);
            }
          : undefined
      }
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("ml-auto h-10 whitespace-nowrap", className)}
        >
          {props.icon}
          {props.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[150px]"
        onInteractOutside={
          keepOpenOnSelect ? () => setIsOpen(false) : undefined
        }
      >
        {props.columns.map((column) => {
          return (
            <DropdownMenuCheckboxItem
              key={column.label}
              className="capitalize"
              checked={column.checked}
              onCheckedChange={column.setChecked}
            >
              {column.label}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
