"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import type { ContactsResponse } from "@/app/api/contacts/route";
import { SenderAvatar } from "@/components/email-list/SenderAvatar";
import { Input } from "@/components/ui/input";

// Assignee picker as drawn in the design: a free-text email input with a
// contact dropdown underneath. Picking fills the contact's email; any raw
// email works without a pick.
export function AssigneeAutocomplete({
  id,
  value,
  onChange,
  onPick,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  // Called when a contact is picked from the list (value already applied)
  onPick?: (email: string) => void;
}) {
  const [open, setOpen] = useState(false);

  // One roster load, filtered locally per keystroke — the endpoint search
  // re-aggregates activity server-side, which is overkill for a picker
  const { data } = useSWR<ContactsResponse>(
    open ? "/api/contacts?limit=500&sort=name" : null,
    { revalidateOnFocus: false },
  );

  const query = value.trim().toLowerCase();
  const options = useMemo(() => {
    const contacts = data?.contacts ?? [];
    return contacts
      .filter((contact) => !!contact.email)
      .filter(
        (contact) =>
          !query ||
          contact.email?.toLowerCase().includes(query) ||
          contact.name?.toLowerCase().includes(query),
      )
      .slice(0, 6);
  }, [data, query]);

  return (
    <div className="relative">
      <Input
        id={id}
        type="text"
        value={value}
        placeholder="Type a name or email…"
        autoComplete="off"
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Delay so an option's onMouseDown wins over the close
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && (
        <div className="absolute inset-x-0 top-11 z-50 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
          {options.map((contact) => (
            <button
              key={contact.email}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
              onMouseDown={(event) => {
                event.preventDefault();
                if (!contact.email) return;
                onChange(contact.email);
                onPick?.(contact.email);
                setOpen(false);
              }}
            >
              <SenderAvatar
                name={contact.name || contact.email || "?"}
                className="size-[26px] text-[10px]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">
                  {contact.name || contact.email}
                </span>
                <span className="block truncate text-[11.5px] text-muted-foreground">
                  {contact.email}
                </span>
              </span>
            </button>
          ))}
          {!options.length && (
            <p className="px-2 py-2 text-[12.5px] text-muted-foreground">
              No matching contacts — a raw email works too.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
