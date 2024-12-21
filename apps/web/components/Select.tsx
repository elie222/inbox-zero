import React from "react";
import type { FieldError } from "react-hook-form";
import clsx from "clsx";
import { ErrorMessage, ExplainText, Label } from "@/components/Input";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  name: string;
  label: string;
  tooltipText?: string;
  options: Array<{ label: string; value: string | number }>;
  explainText?: string;
  error?: FieldError;
  disabled?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
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
          className={clsx(
            "block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-black sm:text-sm sm:leading-6",
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
