"use client";

import { type ReactNode, useState } from "react";
import { BellIcon, ClockIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function DeliveryOptions({
  sendAt,
  remindAt,
  disabled,
  onSendAtChange,
  onRemindAtChange,
}: {
  sendAt: string;
  remindAt: string;
  disabled: boolean;
  onSendAtChange: (value: string) => void;
  onRemindAtChange: (value: string) => void;
}) {
  return (
    <>
      <DeliveryTimePicker
        label="Send later"
        value={sendAt}
        onChange={onSendAtChange}
        disabled={disabled}
        icon={<ClockIcon className="size-3.5" />}
      />
      <DeliveryTimePicker
        label="Remind me"
        value={remindAt}
        onChange={onRemindAtChange}
        disabled={disabled}
        icon={<BellIcon className="size-3.5" />}
        after={sendAt}
      />
    </>
  );
}

function DeliveryTimePicker({
  label,
  value,
  onChange,
  disabled,
  icon,
  after,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  icon: ReactNode;
  after?: string;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const isReminder = label === "Remind me";
  const earliest = Math.max(Date.now(), after ? new Date(after).getTime() : 0);
  const choose = (date: Date) => {
    onChange(date.toISOString());
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="gap-1.5 px-2 text-xs"
          aria-label={label}
        >
          {icon}
          {value
            ? new Date(value).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 space-y-3"
        align="start"
        role="dialog"
        aria-label={label}
      >
        <div>
          <p className="font-medium text-sm">{label}</p>
          <p className="mt-1 text-muted-foreground text-xs">
            {isReminder
              ? "Return this thread to your inbox if no one replies."
              : "Sends even when the app is closed. Times are local."}
          </p>
        </div>
        {[1, 2, 7].map((days) => {
          const date = new Date(earliest);
          date.setDate(date.getDate() + days);
          date.setHours(9, 0, 0, 0);
          return (
            <Button
              key={days}
              type="button"
              variant="ghost"
              className="flex h-auto w-full justify-between px-2 py-2 text-sm"
              onClick={() => choose(date)}
            >
              <span>
                {after
                  ? `${days} ${days === 1 ? "day" : "days"} after sending`
                  : days === 1
                    ? "Tomorrow morning"
                    : `In ${days} days`}
              </span>
              <span className="text-xs text-muted-foreground">
                {date.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}{" "}
                · 9:00
              </span>
            </Button>
          );
        })}
        <label className="block text-xs">
          Choose a date and time
          <input
            aria-label={`${label} date and time`}
            type="datetime-local"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            className="mt-2 w-full rounded-md border border-input bg-background p-2 text-sm"
          />
        </label>
        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={!custom || new Date(custom).getTime() <= earliest}
          onClick={() => choose(new Date(custom))}
        >
          Set time
        </Button>
        {value && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            <XIcon className="mr-1 size-3.5" />
            Clear time
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
