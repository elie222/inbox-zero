"use client";

import { Label, ExplainText, ErrorMessage } from "@/components/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SettingsProperty } from "@inbox-zero/plugin-sdk";
import type { FieldError, Control } from "react-hook-form";
import { Controller as FormController } from "react-hook-form";

interface SettingSelectFieldProps {
  fieldKey: string;
  property: SettingsProperty;
  control: Control<any>;
  error?: FieldError;
}

export function SettingSelectField({
  fieldKey,
  property,
  control,
  error,
}: SettingSelectFieldProps) {
  const options = property.enum || [];

  // convert enum values to options with labels
  const selectOptions = options.map((value: unknown) => {
    const stringValue = String(value);
    // create human-readable labels from values
    const label = stringValue
      .replace(/([A-Z])/g, " $1")
      .replace(/[-_]/g, " ")
      .trim()
      .split(" ")
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    return { value: stringValue, label };
  });

  return (
    <div>
      <Label name={fieldKey} label={property.title || fieldKey} />
      <div className="mt-1">
        <FormController
          name={fieldKey}
          control={control}
          render={({ field }) => (
            <Select
              onValueChange={field.onChange}
              defaultValue={
                field.value?.toString() || property.default?.toString()
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an option..." />
              </SelectTrigger>
              <SelectContent>
                {selectOptions.map(
                  (option: { value: string; label: string }) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          )}
        />
        {property.description && (
          <ExplainText>{property.description}</ExplainText>
        )}
        {error && (
          <ErrorMessage message={error.message || "This field is required"} />
        )}
      </div>
    </div>
  );
}
