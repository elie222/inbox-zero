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
  buildOutlookSearchQuery,
  OUTLOOK_DATE_WITHIN_OPTIONS,
  OUTLOOK_SEARCH_IN_OPTIONS,
  type OutlookSearchFields,
} from "@/app/(app)/[emailAccountId]/mail/outlook-search-query";

export function OutlookSearchFiltersForm({
  initialFields,
  folders = [],
  categories = [],
  onSearch,
}: {
  initialFields: OutlookSearchFields;
  folders?: { name: string }[];
  categories?: { name: string }[];
  onSearch: (query: string) => void;
}) {
  const [fields, setFields] = useState(initialFields);

  function update<Key extends keyof OutlookSearchFields>(
    key: Key,
    value: OutlookSearchFields[Key],
  ) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(buildOutlookSearchQuery(fields));
  }

  return (
    <form
      aria-label="Search options"
      className="grid gap-3"
      onSubmit={handleSubmit}
    >
      <FilterField id="outlook-search-from" label="From">
        <Input
          id="outlook-search-from"
          value={fields.from}
          onChange={(event) => update("from", event.target.value)}
          className={mailControlClassName}
        />
      </FilterField>

      <FilterField id="outlook-search-to" label="To">
        <Input
          id="outlook-search-to"
          value={fields.to}
          onChange={(event) => update("to", event.target.value)}
          className={mailControlClassName}
        />
      </FilterField>

      <FilterField id="outlook-search-subject" label="Subject">
        <Input
          id="outlook-search-subject"
          value={fields.subject}
          onChange={(event) => update("subject", event.target.value)}
          className={mailControlClassName}
        />
      </FilterField>

      <FilterField id="outlook-search-keywords" label="Keywords">
        <Input
          id="outlook-search-keywords"
          value={fields.keywords}
          onChange={(event) => update("keywords", event.target.value)}
          className={mailControlClassName}
        />
      </FilterField>

      <FilterField id="outlook-search-doesnt-have" label="Doesn't have">
        <Input
          id="outlook-search-doesnt-have"
          value={fields.doesntHave}
          onChange={(event) => update("doesntHave", event.target.value)}
          className={mailControlClassName}
        />
      </FilterField>

      <FilterField id="outlook-search-size" label="Size">
        <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_auto] items-center gap-2">
          <Select
            value={fields.sizeComparison}
            onValueChange={(value) =>
              update("sizeComparison", value === "less" ? "less" : "greater")
            }
          >
            <SelectTrigger
              id="outlook-search-size"
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

      <FilterField id="outlook-search-received" label="Received">
        <div className="grid grid-cols-[10rem_minmax(0,1fr)] items-center gap-2">
          <Select
            value={fields.dateWithin}
            onValueChange={(value) => {
              const next = OUTLOOK_DATE_WITHIN_OPTIONS.find(
                (option) => option.value === value,
              );
              if (next) update("dateWithin", next.value);
            }}
          >
            <SelectTrigger
              id="outlook-search-received"
              type="button"
              aria-label="Date range"
              className={mailSelectTriggerClassName}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTLOOK_DATE_WITHIN_OPTIONS.map((option) => (
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

      <FilterField id="outlook-search-in" label="Search">
        <Select
          value={fields.searchIn}
          onValueChange={(value) => update("searchIn", value)}
        >
          <SelectTrigger
            id="outlook-search-in"
            type="button"
            className={mailSelectTriggerClassName}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OUTLOOK_SEARCH_IN_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.name}
              </SelectItem>
            ))}
            {folders.length ? (
              <SelectGroup>
                <SelectLabel>Folders</SelectLabel>
                {folders.map((folder) => (
                  <SelectItem
                    key={`folder:${folder.name}`}
                    value={`folder:${folder.name}`}
                  >
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            {categories.length ? (
              <SelectGroup>
                <SelectLabel>Categories</SelectLabel>
                {categories.map((category) => (
                  <SelectItem
                    key={`category:${category.name}`}
                    value={`category:${category.name}`}
                  >
                    {category.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
          </SelectContent>
        </Select>
      </FilterField>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
        <div className="flex items-center gap-2">
          <Checkbox
            id="outlook-search-has-attachment"
            checked={fields.hasAttachment}
            onCheckedChange={(checked) =>
              update("hasAttachment", checked === true)
            }
          />
          <Label
            htmlFor="outlook-search-has-attachment"
            className="font-normal text-sm"
          >
            Has attachment
          </Label>
        </div>
      </div>

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
