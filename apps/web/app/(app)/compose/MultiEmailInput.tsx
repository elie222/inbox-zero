"use client";

import {
  useState,
  useRef,
  useEffect,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/utils";

interface MultiEmailInputProps {
  name: string;
  label: string;
  placeholder?: string;
  className?: string;
  register?: any;
  error?: any;
}

export default function MultiEmailInput({
  name,
  label = "To",
  placeholder = "",
  className = "",
  register,
  error,
}: MultiEmailInputProps) {
  const [emails, setEmails] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Email validation regex
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const addEmail = (email: string) => {
    const trimmedEmail = email.trim();
    if (
      trimmedEmail &&
      isValidEmail(trimmedEmail) &&
      !emails.includes(trimmedEmail)
    ) {
      const newEmails = [...emails, trimmedEmail];
      setEmails(newEmails);
      if (register) {
        register(name).onChange({
          target: { name, value: newEmails },
        });
      }
    }
    setInputValue("");
  };

  const removeEmail = (index: number) => {
    const newEmails = emails.filter((_, i) => i !== index);
    setEmails(newEmails);
    if (register) {
      register(name).onChange({
        target: { name, value: newEmails },
      });
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === " " || e.key === "Tab") && inputValue) {
      console.log("came here,", e.key);
      e.preventDefault();
      addEmail(inputValue);
    } else if (e.key === "Backspace" && !inputValue && emails.length > 0) {
      removeEmail(emails.length - 1);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleBlur = () => {
    if (inputValue) {
      addEmail(inputValue);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        error && "text-destructive",
        className,
      )}
    >
      <Label
        className={cn(
          "text-sm font-normal text-muted-foreground",
          error && "text-destructive",
        )}
      >
        {label}
      </Label>
      {emails.map((email, index) => (
        <div
          key={index}
          className="flex w-fit items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-sm text-primary"
        >
          <span>{email}</span>
          <button
            type="button"
            onClick={() => removeEmail(index)}
            className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-primary/20"
            aria-label={`Remove ${email}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="min-w-[120px] flex-1 border-none bg-transparent p-0 text-sm outline-none focus:ring-0"
        placeholder={emails.length === 0 ? placeholder : ""}
      />
      <input type="hidden" {...register?.(name)} value={emails.join(",")} />
      {error && (
        <span className="text-xs text-destructive">{error.message}</span>
      )}
    </div>
  );
}
