"use client";

import * as React from "react";
import { CommandLoading } from "cmdk";
import { Check, ChevronsUpDown, Loader2Icon } from "lucide-react";

import { cn } from "@/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function Combobox(props: {
  options: { value: string; label: string }[];
  placeholder: string;
  emptyText: React.ReactNode;
  value?: string;
  onChangeValue: (value: string) => void;
  loading: boolean;
  search?: string;
  onSearch?: (value: string) => void;
}) {
  const { value, onChangeValue, placeholder, emptyText, loading } = props;
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          // biome-ignore lint/a11y/useSemanticElements: <explanation>
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {(value &&
            props.options.find((option) => option.value === value)?.label) ||
            value ||
            placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0 sm:w-[500px]">
        <Command>
          <CommandInput
            placeholder="Search..."
            value={props.onSearch ? props.search : undefined}
            onValueChange={props.onSearch}
          />
          <CommandList>
            {loading && (
              <CommandLoading>
                <div className="flex items-center justify-center">
                  <Loader2Icon className="m-4 h-4 w-4 animate-spin" />
                </div>
              </CommandLoading>
            )}
            <CommandEmpty>{emptyText}</CommandEmpty>
            {props.options.length ? (
              <CommandGroup>
                {props.options.map((options) => (
                  <CommandItem
                    key={options.value}
                    value={options.value}
                    onSelect={(currentValue) => {
                      onChangeValue(currentValue === value ? "" : currentValue);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === options.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {options.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
