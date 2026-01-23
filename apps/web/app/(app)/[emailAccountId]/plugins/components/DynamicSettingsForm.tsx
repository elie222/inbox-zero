"use client";

import { useCallback } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PluginSettings, SettingsProperty } from "@inbox-zero/plugin-sdk";
import { SettingTextField } from "./SettingTextField";
import { SettingSelectField } from "./SettingSelectField";
import { SettingToggleField } from "./SettingToggleField";
import { SettingSliderField } from "./SettingSliderField";
import { SettingArrayField } from "./SettingArrayField";

interface DynamicSettingsFormProps {
  schema: PluginSettings;
  currentSettings: Record<string, unknown>;
  onSave: (settings: Record<string, unknown>) => Promise<boolean>;
}

export function DynamicSettingsForm({
  schema,
  currentSettings,
  onSave,
}: DynamicSettingsFormProps) {
  const defaultValues = getDefaultValues(schema, currentSettings);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
    setValue,
    watch,
  } = useForm({
    defaultValues,
  });

  const onSubmit = useCallback(
    async (data: Record<string, unknown>) => {
      const success = await onSave(data);
      if (success) {
        reset(data);
      }
    },
    [onSave, reset],
  );

  const handleReset = () => {
    const defaults = getDefaultValues(schema, {});
    reset(defaults);
  };

  const sections = schema.ui?.sections || [
    {
      title: "Settings",
      fields: Object.keys(schema.schema.properties),
    },
  ];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {sections.map((section, sectionIndex) => (
        <Card key={`${section.title}-${sectionIndex}`}>
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
            {section.description && (
              <CardDescription>{section.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {section.fields.map((fieldKey: string) => {
              const property = schema.schema.properties[fieldKey];
              if (!property) return null;

              return (
                <div key={fieldKey}>
                  {renderField({
                    fieldKey,
                    property,
                    register,
                    control,
                    setValue,
                    watch,
                    error: errors[fieldKey],
                  })}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleReset}
          disabled={isSubmitting || !isDirty}
        >
          Reset to Defaults
        </Button>
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}

function renderField({
  fieldKey,
  property,
  register,
  control,
  setValue,
  watch,
  error,
}: {
  fieldKey: string;
  property: unknown;
  register: any;
  control: any;
  setValue: any;
  watch: any;
  error?: any;
}) {
  const prop = property as SettingsProperty;

  // boolean type renders as toggle/switch
  if (prop.type === "boolean") {
    return (
      <SettingToggleField
        fieldKey={fieldKey}
        property={prop}
        control={control}
      />
    );
  }

  // array type renders as array input
  if (prop.type === "array") {
    return (
      <SettingArrayField
        fieldKey={fieldKey}
        property={prop}
        setValue={setValue}
        watch={watch}
        error={error}
      />
    );
  }

  // enum renders as select dropdown
  if (prop.enum && prop.enum.length > 0) {
    return (
      <SettingSelectField
        fieldKey={fieldKey}
        property={prop}
        control={control}
        error={error}
      />
    );
  }

  // number with min/max renders as slider
  if (
    prop.type === "number" &&
    prop.minimum !== undefined &&
    prop.maximum !== undefined
  ) {
    return (
      <SettingSliderField
        fieldKey={fieldKey}
        property={prop}
        register={register}
        watch={watch}
      />
    );
  }

  // default to text field for string/number
  return (
    <SettingTextField
      fieldKey={fieldKey}
      property={prop}
      register={register}
      error={error}
    />
  );
}

function getDefaultValues(
  schema: PluginSettings,
  currentSettings: Record<string, unknown>,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  for (const [key, property] of Object.entries(schema.schema.properties)) {
    const prop = property as SettingsProperty;
    if (currentSettings[key] !== undefined) {
      defaults[key] = currentSettings[key];
    } else if (prop.default !== undefined) {
      defaults[key] = prop.default;
    } else {
      // set sensible defaults based on type
      if (prop.type === "boolean") {
        defaults[key] = false;
      } else if (prop.type === "array") {
        defaults[key] = [];
      } else if (prop.type === "number") {
        defaults[key] = prop.minimum ?? 0;
      } else {
        defaults[key] = "";
      }
    }
  }

  return defaults;
}
