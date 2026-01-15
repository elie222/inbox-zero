import { useEffect, useId, useRef } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/utils";

export function NewCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (shiftKey: boolean) => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate ?? false;
    }
  }, [indeterminate]);

  return (
    <label
      className={cn(
        "relative w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer",
        checked || indeterminate
          ? "bg-blue-500 border-blue-500 text-white"
          : "border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500",
      )}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) =>
          onChange(
            e.nativeEvent instanceof MouseEvent
              ? e.nativeEvent.shiftKey
              : false,
          )
        }
        className="sr-only"
      />
      {checked && <Check className="size-3.5" strokeWidth={3} />}
      {indeterminate && !checked && (
        <Minus className="size-3.5" strokeWidth={3} />
      )}
    </label>
  );
}
