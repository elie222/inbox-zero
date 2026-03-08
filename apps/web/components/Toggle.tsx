import type { FieldError } from "react-hook-form";
import { ErrorMessage, ExplainText, Label } from "./Input";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { Switch } from "@/components/ui/switch";

export interface ToggleProps {
  disabled?: boolean;
  enabled: boolean;
  error?: FieldError;
  explainText?: string;
  label?: string;
  labelRight?: string;
  name: string;
  onChange: (enabled: boolean) => void;
  tooltipText?: string;
}

export const Toggle = (props: ToggleProps) => {
  const { label, labelRight, tooltipText, enabled, onChange, disabled } = props;

  return (
    <div>
      <div className="flex items-center">
        {label && (
          <span className="mr-3 flex items-center gap-1 text-nowrap">
            <Label name={props.name} label={label} />
            {tooltipText && <TooltipExplanation text={tooltipText} />}
          </span>
        )}
        <Switch
          checked={enabled}
          onCheckedChange={onChange}
          disabled={disabled}
        />
        {labelRight && (
          <span className="ml-3 flex items-center gap-1 text-nowrap">
            <Label name={props.name} label={labelRight} />
            {tooltipText && <TooltipExplanation text={tooltipText} />}
          </span>
        )}
      </div>
      {props.explainText ? (
        <ExplainText>{props.explainText}</ExplainText>
      ) : null}
      {props.error?.message ? (
        <ErrorMessage message={props.error?.message} />
      ) : null}
    </div>
  );
};
