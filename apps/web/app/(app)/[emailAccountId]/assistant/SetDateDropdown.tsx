"use client";

import { CalendarIcon } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function SetDateDropdown({
  onChange,
  value,
  placeholder,
  disabled,
}: {
  onChange: (date?: Date) => void;
  value?: Date;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { i18n } = useLingui();

  return (
    <Popover modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full pl-3 text-left font-normal",
            !value && "text-muted-foreground",
          )}
          disabled={disabled}
        >
          {value ? (
            i18n.date(value, { dateStyle: "long" })
          ) : (
            <span>{placeholder || <Trans>Set a date</Trans>}</span>
          )}
          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          captionLayout="dropdown-buttons"
          fromYear={2000}
          toDate={new Date()}
          selected={value}
          onSelect={onChange}
          disabled={(date) =>
            date > new Date() || date < new Date("1900-01-01")
          }
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
