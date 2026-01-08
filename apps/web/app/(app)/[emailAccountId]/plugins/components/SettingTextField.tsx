"use client";

import { Input } from "@/components/Input";
import type { SettingsProperty } from "@inbox-zero/plugin-sdk";
import type { FieldError, UseFormRegister } from "react-hook-form";

interface SettingTextFieldProps {
  fieldKey: string;
  property: SettingsProperty;
  register: UseFormRegister<any>;
  error?: FieldError;
}

export function SettingTextField({
  fieldKey,
  property,
  register,
  error,
}: SettingTextFieldProps) {
  const inputType = property.type === "number" ? "number" : "text";

  const registerOptions: any = {
    valueAsNumber: property.type === "number",
  };

  if (property.minimum !== undefined) {
    registerOptions.min = property.minimum;
  }
  if (property.maximum !== undefined) {
    registerOptions.max = property.maximum;
  }
  if (property.pattern) {
    registerOptions.pattern = new RegExp(property.pattern);
  }

  return (
    <Input
      type={inputType}
      name={fieldKey}
      label={property.title || fieldKey}
      placeholder={property.default?.toString() || ""}
      explainText={property.description}
      registerProps={register(fieldKey, registerOptions)}
      error={error}
      min={property.minimum}
      max={property.maximum}
    />
  );
}
