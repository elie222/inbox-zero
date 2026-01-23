"use client";

import { Label, ExplainText } from "@/components/Input";
import { Switch } from "@/components/ui/switch";
import type { SettingsProperty } from "@inbox-zero/plugin-sdk";
import type { Control } from "react-hook-form";
import { Controller as FormController } from "react-hook-form";

interface SettingToggleFieldProps {
  fieldKey: string;
  property: SettingsProperty;
  control: Control<any>;
}

export function SettingToggleField({
  fieldKey,
  property,
  control,
}: SettingToggleFieldProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="flex-1">
        <Label name={fieldKey} label={property.title || fieldKey} />
        {property.description && (
          <div className="mt-1">
            <ExplainText>{property.description}</ExplainText>
          </div>
        )}
      </div>
      <FormController
        name={fieldKey}
        control={control}
        render={({ field }) => (
          <Switch
            checked={field.value || false}
            onCheckedChange={field.onChange}
          />
        )}
      />
    </div>
  );
}
