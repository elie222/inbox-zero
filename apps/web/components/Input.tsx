import type React from "react";
import type { HTMLInputTypeAttribute } from "react";
import type { FieldError } from "react-hook-form";
import { MinusCircleIcon, PlusCircleIcon } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import { cn } from "@/utils";
import { TooltipExplanation } from "@/components/TooltipExplanation";

export interface InputProps {
  name: string;
  label?: string;
  labelComponent?: React.ReactNode;
  type: HTMLInputTypeAttribute;
  placeholder?: string;
  registerProps?: any; // TODO
  explainText?: string;
  tooltipText?: string;
  as?: React.ElementType;
  autosizeTextarea?: boolean;
  rows?: number;
  maxRows?: number;
  min?: number;
  step?: number;
  max?: number;
  disabled?: boolean;
  error?: FieldError;
  leftText?: string;
  rightText?: string;
  className?: string;
  onClickAdd?: () => void;
  onClickRemove?: () => void;
}

export const Input = (props: InputProps) => {
  const Component = props.autosizeTextarea
    ? TextareaAutosize
    : props.as || "input";

  const errorMessage = getErrorMessage(props.error?.type, props.error?.message);

  const inputProps = {
    type: props.type,
    name: props.name,
    id: props.name,
    placeholder: props.placeholder,
    ...(props.autosizeTextarea
      ? {
          minRows: props.rows,
          maxRows: props.maxRows,
        }
      : {
          rows: props.rows,
        }),
    min: props.min,
    max: props.max,
    step: props.step,
    disabled: props.disabled,
    ...props.registerProps,
  };

  return (
    <div>
      {props.labelComponent ? (
        props.labelComponent
      ) : props.label ? (
        <Label
          name={props.name}
          label={props.label}
          tooltipText={props.tooltipText}
        />
      ) : null}

      <div className={cn(props.label || props.labelComponent ? "mt-1" : "")}>
        <div className="flex">
          {props.leftText ? (
            <div className="flex-1">
              <InputWithLeftFixedText
                inputProps={inputProps}
                leftText={props.leftText}
                className={props.className}
              />
            </div>
          ) : props.rightText ? (
            <InputWithRightFixedText
              inputProps={inputProps}
              rightText={props.rightText}
              className={props.className}
            />
          ) : (
            <Component
              {...inputProps}
              className={cn(
                "block w-full flex-1 rounded-md border-slate-300 bg-background shadow-sm focus:border-black focus:ring-black disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted-foreground disabled:ring-slate-200 dark:border-slate-700 dark:text-slate-100 dark:focus:border-slate-400 dark:focus:ring-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-400 dark:disabled:ring-slate-700 sm:text-sm",
                props.className,
              )}
            />
          )}

          <AddRemoveButtons
            onClickAdd={props.onClickAdd}
            onClickRemove={props.onClickRemove}
          />
        </div>

        {props.explainText ? (
          <ExplainText>{props.explainText}</ExplainText>
        ) : null}
        {errorMessage ? <ErrorMessage message={errorMessage} /> : null}
      </div>
    </div>
  );
};

type LabelProps = Pick<InputProps, "name" | "label" | "tooltipText">;

export const Label = (props: LabelProps) => {
  return (
    <label
      htmlFor={props.name}
      className="block text-sm font-medium text-slate-700 dark:text-slate-200"
    >
      {props.tooltipText ? (
        <span className="flex items-center space-x-1">
          <span>{props.label}</span>
          <TooltipExplanation text={props.tooltipText} />
        </span>
      ) : (
        props.label
      )}
    </label>
  );
};

export const ExplainText = (props: { children: React.ReactNode }) => {
  return (
    <div className="mt-1 text-sm leading-snug text-muted-foreground dark:text-slate-400">
      {props.children}
    </div>
  );
};

export const ErrorMessage = (props: { message: string }) => {
  return <div className="mt-0.5 text-sm text-red-400">{props.message}</div>;
};

const InputWithLeftFixedText = (props: {
  leftText: string;
  inputProps: any;
  className?: string;
}) => {
  return (
    <div className="flex rounded-md shadow-sm">
      <span className="inline-flex max-w-[150px] flex-shrink items-center rounded-l-md border border-r-0 border-slate-300 bg-slate-50 px-3 text-muted-foreground dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 sm:max-w-full sm:text-sm">
        {props.leftText}
      </span>
      <input
        {...props.inputProps}
        className={cn(
          "block w-[120px] flex-1 rounded-none rounded-r-md border-slate-300 bg-background focus:border-black focus:ring-black disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted-foreground disabled:ring-slate-200 dark:border-slate-700 dark:text-slate-100 dark:focus:border-slate-400 dark:focus:ring-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-400 dark:disabled:ring-slate-700 sm:w-full sm:min-w-[150px] sm:max-w-full sm:text-sm",
          props.className,
        )}
      />
    </div>
  );
};

const InputWithRightFixedText = (props: {
  rightText: string;
  inputProps: any;
  className?: string;
}) => {
  return (
    <div className="flex rounded-md shadow-sm">
      <input
        {...props.inputProps}
        className={cn(
          "block w-full min-w-0 flex-1 rounded-none rounded-l-md border-slate-300 bg-background focus:border-black focus:ring-black disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted-foreground disabled:ring-slate-200 dark:border-slate-700 dark:text-slate-100 dark:focus:border-slate-400 dark:focus:ring-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-400 dark:disabled:ring-slate-700 sm:text-sm",
          props.className,
        )}
      />
      <span className="inline-flex items-center rounded-r-md border border-l-0 border-slate-300 bg-slate-50 px-3 text-muted-foreground dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 sm:text-sm">
        {props.rightText}
      </span>
    </div>
  );
};

export const AddRemoveButtons = (props: {
  onClickAdd?: () => void;
  onClickRemove?: () => void;
}) => {
  if (!props.onClickAdd && !props.onClickRemove) return null;

  return (
    <div className="ml-2 flex space-x-2">
      {props.onClickAdd && (
        <button
          type="button"
          className="text-slate-700 transition-transform hover:scale-110 hover:text-primary dark:text-slate-300 dark:hover:text-slate-100"
          onClick={props.onClickAdd}
        >
          <PlusCircleIcon className="h-6 w-6" />
        </button>
      )}
      {props.onClickRemove && (
        <button
          type="button"
          className="text-slate-700 transition-transform hover:scale-110 hover:text-primary dark:text-slate-300 dark:hover:text-slate-100"
          onClick={props.onClickRemove}
        >
          <MinusCircleIcon className="h-6 w-6" />
        </button>
      )}
    </div>
  );
};

export function LabelWithRightButton(
  props: LabelProps & { rightButton: { text: string; onClick: () => void } },
) {
  return (
    <div className="flex justify-between">
      <Label {...props} />
      <button
        type="button"
        className="cursor-pointer bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-sm text-transparent hover:from-sky-600 hover:to-blue-700"
        onClick={props.rightButton.onClick}
      >
        {props.rightButton.text}
      </button>
    </div>
  );
}

function getErrorMessage(
  errorType?: FieldError["type"],
  errorMessage?: FieldError["message"],
) {
  if (errorType === "required") return "This field is required";
  if (errorType === "minLength") return "This field is too short";
  if (errorType === "maxLength") return "This field is too long";

  return errorMessage;
}
