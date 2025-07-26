import { forwardRef } from "react";
import type { FieldError } from "react-hook-form";
import { cn } from "@/utils";
import { ErrorMessage, ExplainText, Label } from "@/components/Input";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  name: string;
  label?: string;
  tooltipText?: string;
  options: Array<{ label: string; value: string | number }>;
  explainText?: string;
  error?: FieldError;
  disabled?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (props, ref) => {
    const { label, tooltipText, options, explainText, error, ...selectProps } =
      props;

    return (
      <div>
        {label ? (
          <Label name={props.name} label={label} tooltipText={tooltipText} />
        ) : null}
        <select
          id={props.name}
          className={cn(
            "block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            label && "mt-1",
          )}
          disabled={props.disabled}
          ref={ref}
          {...selectProps}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {explainText ? <ExplainText>{explainText}</ExplainText> : null}
        {error?.message ? <ErrorMessage message={error?.message} /> : null}
      </div>
    );
  },
);

Select.displayName = "Select";
