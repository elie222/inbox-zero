"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildMailSearchQuery,
  DATE_WITHIN_OPTIONS,
  SEARCH_IN_OPTIONS,
  type MailSearchFields,
} from "@/app/(app)/[emailAccountId]/mail/mail-search-query";

export function MailSearchFiltersForm({
  initialFields,
  extraLocations = [],
  onSearch,
  variant = "gmail",
}: {
  initialFields: MailSearchFields;
  extraLocations?: { name: string }[];
  onSearch: (query: string) => void;
  /** Combined inboxes only share operators both providers understand. */
  variant?: "gmail" | "common";
}) {
  const isGmail = variant === "gmail";
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
        <Input
          id="mail-search-from"
          value={fields.from}
          onChange={(event) => update("from", event.target.value)}
          className={mailControlClassName}
        />
      </FilterField>

      <FilterField id="mail-search-to" label="To">
        <Input
          id="mail-search-to"
          value={fields.to}
          onChange={(event) => update("to", event.target.value)}
          className={mailControlClassName}
        />
      </FilterField>

      <FilterField id="mail-search-subject" label="Subject">
        <Input
          id="mail-search-subject"
          value={fields.subject}
          onChange={(event) => update("subject", event.target.value)}
          className={mailControlClassName}
        />
      </FilterField>

      <FilterField id="mail-search-has-words" label="Has the words">
        <Input
          id="mail-search-has-words"
          value={fields.hasWords}
          onChange={(event) => update("hasWords", event.target.value)}
          className={mailControlClassName}
        />
      </FilterField>

      <FilterField id="mail-search-doesnt-have" label="Doesn't have">
        <Input
          id="mail-search-doesnt-have"
          value={fields.doesntHave}
          onChange={(event) => update("doesntHave", event.target.value)}
          className={mailControlClassName}
        />
      </FilterField>

      {isGmail ? (
        <>
          <FilterField id="mail-search-size" label="Size">
            <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_auto] items-center gap-2">
              <Select
                value={fields.sizeComparison}
                onValueChange={(value) =>
                  update(
                    "sizeComparison",
                    value === "less" ? "less" : "greater",
                  )
                }
              >
                <SelectTrigger
                  id="mail-search-size"
                  type="button"
                  aria-label="Size comparison"
                  className={mailSelectTriggerClassName}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="greater">greater than</SelectItem>
                  <SelectItem value="less">less than</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                aria-label="Size amount"
                value={fields.sizeValue}
                onChange={(event) => update("sizeValue", event.target.value)}
                className={mailControlClassName}
              />
              <Select
                value={fields.sizeUnit}
                onValueChange={(value) =>
                  update("sizeUnit", value === "KB" ? "KB" : "MB")
                }
              >
                <SelectTrigger
                  type="button"
                  aria-label="Size unit"
                  className={`${mailSelectTriggerClassName} w-20`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MB">MB</SelectItem>
                  <SelectItem value="KB">KB</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </FilterField>

          <FilterField id="mail-search-date-within" label="Date within">
            <div className="grid grid-cols-[10rem_minmax(0,1fr)] items-center gap-2">
              <Select
                value={fields.dateWithin}
                onValueChange={(value) => {
                  const next = DATE_WITHIN_OPTIONS.find(
                    (option) => option.value === value,
                  );
                  if (next) update("dateWithin", next.value);
                }}
              >
                <SelectTrigger
                  id="mail-search-date-within"
                  type="button"
                  aria-label="Date range"
                  className={mailSelectTriggerClassName}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_WITHIN_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                aria-label="Date"
                value={fields.date}
                onChange={(event) => update("date", event.target.value)}
                className={mailControlClassName}
              />
            </div>
          </FilterField>

          <FilterField id="mail-search-in" label="Search">
            <Select
              value={fields.searchIn}
              onValueChange={(value) => update("searchIn", value)}
            >
              <SelectTrigger
                id="mail-search-in"
                type="button"
                className={mailSelectTriggerClassName}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEARCH_IN_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.name}
                  </SelectItem>
                ))}
                {extraLocations.length ? (
                  <SelectGroup>
                    <SelectLabel>Labels</SelectLabel>
                    {extraLocations.map((location) => (
                      <SelectItem
                        key={location.name}
                        value={`label:${location.name}`}
                      >
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
              </SelectContent>
            </Select>
          </FilterField>
        </>
      ) : null}

      {isGmail ? (
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
      ) : null}

      <div className="flex justify-end pt-1">
        <Button type="submit" variant="gradient" size="sm">
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

const mailControlClassName = "h-8 text-xs";
const mailSelectTriggerClassName = "h-8 w-full text-xs";
