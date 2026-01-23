"use client";

import { useState } from "react";
import { Label, ExplainText, ErrorMessage } from "@/components/Input";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { XIcon, PlusIcon } from "lucide-react";
import type { SettingsProperty } from "@inbox-zero/plugin-sdk";
import type {
  FieldError,
  UseFormSetValue,
  UseFormWatch,
} from "react-hook-form";

interface SettingArrayFieldProps {
  fieldKey: string;
  property: SettingsProperty;
  setValue: UseFormSetValue<any>;
  watch: UseFormWatch<any>;
  error?: FieldError;
}

export function SettingArrayField({
  fieldKey,
  property,
  setValue,
  watch,
  error,
}: SettingArrayFieldProps) {
  const [newItem, setNewItem] = useState("");
  const currentArray = (watch(fieldKey) || property.default || []) as string[];

  const handleAdd = () => {
    if (!newItem.trim()) return;

    const updatedArray = [...currentArray, newItem.trim()];
    setValue(fieldKey, updatedArray, { shouldDirty: true });
    setNewItem("");
  };

  const handleRemove = (index: number) => {
    const updatedArray = currentArray.filter((_, i) => i !== index);
    setValue(fieldKey, updatedArray, { shouldDirty: true });
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div>
      <Label name={fieldKey} label={property.title || fieldKey} />
      <div className="mt-1">
        {property.description && (
          <ExplainText>{property.description}</ExplainText>
        )}

        {currentArray.length > 0 && (
          <div className="mt-2 space-y-2">
            {currentArray.map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
              >
                <span className="flex-1 text-sm text-slate-700 dark:text-slate-300">
                  {item}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <Input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Add new item..."
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAdd}
            disabled={!newItem.trim()}
          >
            <PlusIcon className="h-4 w-4" />
          </Button>
        </div>

        {error && (
          <ErrorMessage message={error.message || "This field has errors"} />
        )}
      </div>
    </div>
  );
}
