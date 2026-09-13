"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  buildMailSearchQuery,
  DATE_WITHIN_OPTIONS,
  SEARCH_IN_OPTIONS,
  type MailSearchFields,
} from "@/app/(app)/[emailAccountId]/mail/mail-search-query";
import { cn } from "@/utils";

export function MailSearchFiltersForm({
  initialFields,
  extraLocations = [],
  onSearch,
}: {
  initialFields: MailSearchFields;
  extraLocations?: { name: string }[];
  onSearch: (query: string) => void;
}) {
  const [fields, setFields] = useState(initialFields);

  function update<Key extends keyof MailSearchFields>(
    key: Key,
    value: MailSearchFields[Key],
  ) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(buildMailSearchQuery(fields));
  }

  return (
    <form
      aria-label="Search options"
      className="grid gap-3"
      onSubmit={handleSubmit}
    >
      <FilterField id="mail-search-from" label="From">
        <input
          id="mail-search-from"
          value={fields.from}
          onChange={(event) => update("from", event.target.value)}
          className={underlineField}
        />
      </FilterField>

      <FilterField id="mail-search-to" label="To">
        <input
          id="mail-search-to"
          value={fields.to}
          onChange={(event) => update("to", event.target.value)}
          className={underlineField}
        />
      </FilterField>

      <FilterField id="mail-search-subject" label="Subject">
        <input
          id="mail-search-subject"
          value={fields.subject}
          onChange={(event) => update("subject", event.target.value)}
          className={underlineField}
        />
      </FilterField>

      <FilterField id="mail-search-has-words" label="Has the words">
        <input
          id="mail-search-has-words"
          value={fields.hasWords}
          onChange={(event) => update("hasWords", event.target.value)}
          className={underlineField}
        />
      </FilterField>

      <FilterField id="mail-search-doesnt-have" label="Doesn't have">
        <input
          id="mail-search-doesnt-have"
          value={fields.doesntHave}
          onChange={(event) => update("doesntHave", event.target.value)}
          className={underlineField}
        />
      </FilterField>

      <FilterField id="mail-search-size" label="Size">
        <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_auto] items-end gap-2">
          <select
            id="mail-search-size"
            aria-label="Size comparison"
            value={fields.sizeComparison}
            onChange={(event) =>
              update(
                "sizeComparison",
                event.target.value === "less" ? "less" : "greater",
              )
            }
            className={underlineSelect}
          >
            <option value="greater">greater than</option>
            <option value="less">less than</option>
          </select>
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            aria-label="Size amount"
            value={fields.sizeValue}
            onChange={(event) => update("sizeValue", event.target.value)}
            className={underlineField}
          />
          <select
            aria-label="Size unit"
            value={fields.sizeUnit}
            onChange={(event) =>
              update("sizeUnit", event.target.value === "KB" ? "KB" : "MB")
            }
            className={cn(underlineSelect, "w-16")}
          >
            <option value="MB">MB</option>
            <option value="KB">KB</option>
          </select>
        </div>
      </FilterField>

      <FilterField id="mail-search-date-within" label="Date within">
        <div className="grid grid-cols-[10rem_minmax(0,1fr)] items-end gap-2">
          <select
            id="mail-search-date-within"
            aria-label="Date range"
            value={fields.dateWithin}
            onChange={(event) => {
              const next = DATE_WITHIN_OPTIONS.find(
                (option) => option.value === event.target.value,
              );
              if (next) update("dateWithin", next.value);
            }}
            className={underlineSelect}
          >
            {DATE_WITHIN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            aria-label="Date"
            value={fields.date}
            onChange={(event) => update("date", event.target.value)}
            className={underlineField}
          />
        </div>
      </FilterField>

      <FilterField id="mail-search-in" label="Search">
        <select
          id="mail-search-in"
          value={fields.searchIn}
          onChange={(event) => update("searchIn", event.target.value)}
          className={underlineSelect}
        >
          {SEARCH_IN_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.name}
            </option>
          ))}
          {extraLocations.length ? (
            <optgroup label="Labels">
              {extraLocations.map((location) => (
                <option key={location.name} value={`label:${location.name}`}>
                  {location.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </FilterField>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
        <div className="flex items-center gap-2">
          <Checkbox
            id="mail-search-has-attachment"
            checked={fields.hasAttachment}
            onCheckedChange={(checked) =>
              update("hasAttachment", checked === true)
            }
          />
          <Label
            htmlFor="mail-search-has-attachment"
            className="font-normal text-sm"
          >
            Has attachment
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="mail-search-exclude-chats"
            checked={fields.excludeChats}
            onCheckedChange={(checked) =>
              update("excludeChats", checked === true)
            }
          />
          <Label
            htmlFor="mail-search-exclude-chats"
            className="font-normal text-sm"
          >
            Don't include chats
          </Label>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <Button type="submit" size="sm">
          Search
        </Button>
      </div>
    </form>
  );
}

function FilterField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[7.25rem_minmax(0,1fr)] items-center gap-x-3">
      <Label htmlFor={id} className="font-normal text-muted-foreground text-sm">
        {label}
      </Label>
      {children}
    </div>
  );
}

const underlineField =
  "h-8 w-full rounded-none border-0 border-b border-input bg-transparent px-1 text-sm outline-none transition-colors focus:border-foreground";

const underlineSelect =
  "h-8 w-full cursor-pointer rounded-none border-0 border-b border-input bg-transparent px-0 text-sm outline-none transition-colors focus:border-foreground";
