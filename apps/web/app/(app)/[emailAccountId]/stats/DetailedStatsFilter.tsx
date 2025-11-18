"use client";

import * as React from "react";
import type { DropdownMenuCheckboxItemProps } from "@radix-ui/react-dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils";
import { Separator } from "@/components/ui/separator";
import { ChevronDown } from "lucide-react";

type Checked = DropdownMenuCheckboxItemProps["checked"];

export function DetailedStatsFilter(props: {
  label: string;
  icon: React.ReactNode;
  columns: {
    label: string;
    checked: Checked;
    setChecked: (value: Checked) => void;
    separatorAfter?: boolean;
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
          className={cn("h-10 whitespace-nowrap", className)}
        >
          {props.icon}
          {props.label}
          <ChevronDown className="ml-2 h-4 w-4 text-gray-400" />
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
            <React.Fragment key={column.label}>
              <DropdownMenuCheckboxItem
                className="capitalize"
                checked={column.checked}
                onCheckedChange={column.setChecked}
              >
                {column.label}
              </DropdownMenuCheckboxItem>
              {column.separatorAfter && <Separator />}
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
