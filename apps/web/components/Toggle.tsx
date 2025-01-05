import { Switch, Field } from "@headlessui/react";
import clsx from "clsx";
import type { FieldError } from "react-hook-form";
import { ErrorMessage, ExplainText, Label } from "./Input";

export interface ToggleProps {
  name: string;
  label?: string;
  labelRight?: string;
  enabled: boolean;
  explainText?: string;
  error?: FieldError;
  onChange: (enabled: boolean) => void;
}

export const Toggle = (props: ToggleProps) => {
  const { label, labelRight, enabled, onChange } = props;

  return (
    <div>
      <Field as="div" className="flex items-center justify-center">
        {label && (
          <span className="mr-3 text-nowrap">
            <Label name={props.name} label={label} />
          </span>
        )}
        <Switch
          checked={enabled}
          onChange={onChange}
          className={clsx(
            enabled ? "bg-black" : "bg-gray-200",
            "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2",
          )}
        >
          <span className="sr-only">{label}</span>
          <span
            aria-hidden="true"
            className={clsx(
              enabled ? "translate-x-5" : "translate-x-0",
              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
            )}
          />
        </Switch>
        {labelRight && (
          <span className="ml-3 text-nowrap">
            <Label name={props.name} label={labelRight} />
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
