import { Switch, Field } from "@headlessui/react";
import clsx from "clsx";
import type { FieldError } from "react-hook-form";
import { ErrorMessage, ExplainText, Label } from "./Input";
import { TooltipExplanation } from "@/components/TooltipExplanation";

export interface ToggleProps {
  name: string;
  label?: string;
  labelRight?: string;
  tooltipText?: string;
  enabled: boolean;
  explainText?: string;
  error?: FieldError;
  onChange: (enabled: boolean) => void;
  bgClass?: string;
}

export const Toggle = (props: ToggleProps) => {
  const {
    label,
    labelRight,
    tooltipText,
    enabled,
    onChange,
    bgClass = "bg-black dark:bg-primary",
  } = props;

  return (
    <div>
      <Field as="div" className="flex items-center">
        {label && (
          <span className="mr-3 flex items-center gap-1 text-nowrap">
            <Label name={props.name} label={label} />
            {tooltipText && <TooltipExplanation text={tooltipText} />}
          </span>
        )}
        <Switch
          checked={enabled}
          onChange={onChange}
          className={clsx(
            enabled ? bgClass : "bg-gray-200 dark:bg-input",
            "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 dark:focus:ring-white dark:focus:ring-offset-gray-900",
          )}
        >
          <span className="sr-only">{label}</span>
          <span
            aria-hidden="true"
            className={clsx(
              enabled ? "translate-x-5" : "translate-x-0",
              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out",
            )}
          />
        </Switch>
        {labelRight && (
          <span className="ml-3 flex items-center gap-1 text-nowrap">
            <Label name={props.name} label={labelRight} />
            {tooltipText && <TooltipExplanation text={tooltipText} />}
          </span>
        )}
      </Field>
      {props.explainText ? (
        <ExplainText>{props.explainText}</ExplainText>
      ) : null}
      {props.error?.message ? (
        <ErrorMessage message={props.error?.message} />
      ) : null}
    </div>
  );
};
