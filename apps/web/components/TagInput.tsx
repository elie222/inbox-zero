"use client";

import {
  useState,
  useCallback,
  useRef,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { XIcon } from "lucide-react";
import { cn } from "@/utils";

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  validate?: (value: string) => string | null;
  className?: string;
  id?: string;
  label?: string;
  error?: string | null;
}

export function TagInput({
  value,
  onChange,
  placeholder = "Type and press Enter",
  validate,
  className,
  id,
  label,
  error,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = useCallback(
    (tag: string) => {
      const trimmedTag = tag.trim();
      if (!trimmedTag) return;

      if (validate) {
        const validationError = validate(trimmedTag);
        if (validationError) {
          setInputError(validationError);
          return;
        }
      }

      if (value.includes(trimmedTag)) {
        setInputError("This value has already been added");
        return;
      }

      onChange([...value, trimmedTag]);
      setInputValue("");
      setInputError(null);
    },
    [value, onChange, validate],
  );

  const removeTag = useCallback(
    (tagToRemove: string) => {
      onChange(value.filter((tag) => tag !== tagToRemove));
    },
    [value, onChange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addTag(inputValue);
      } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
        e.preventDefault();
        removeTag(value[value.length - 1]);
      }
    },
    [inputValue, addTag, value, removeTag],
  );

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      if (newValue.includes(",")) {
        const parts = newValue.split(",");
        for (const part of parts) {
          addTag(part);
        }
      } else {
        setInputValue(newValue);
        setInputError(null);
      }
    },
    [addTag],
  );

  const handleBlur = useCallback(() => {
    if (inputValue.trim()) {
      addTag(inputValue);
    }
  }, [inputValue, addTag]);

  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const displayError = error || inputError;

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium mb-1.5">
          {label}
        </label>
      )}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: clicking focuses the input which handles keyboard events */}
      <div
        onClick={handleContainerClick}
        className={cn(
          "flex flex-wrap gap-1.5 p-2 min-h-[42px] w-full rounded-md border border-input bg-background text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 cursor-text",
          displayError && "border-destructive",
        )}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pl-2.5 pr-1.5 text-sm text-secondary-foreground"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-secondary-foreground/10"
              aria-label={`Remove ${tag}`}
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] border-0 bg-transparent p-0 outline-none focus:ring-0 placeholder:text-muted-foreground"
        />
      </div>
      {displayError && (
        <p className="mt-1.5 text-sm text-destructive">{displayError}</p>
      )}
    </div>
  );
}
