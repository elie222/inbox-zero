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
}) {
  const { keepOpenOnSelect } = props;
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
          className="ml-auto hidden h-10 lg:flex"
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
